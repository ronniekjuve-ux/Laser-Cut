# -*- coding: utf-8 -*-
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db.base import Base
from app.models.user import User, UserRole, UserStatus
from app.models.message import Message, MessageMention, ChatType
from app.services.chat import get_visible_messages, create_message, get_unread_count


@pytest_asyncio.fixture
async def db_session():
    """Create an in-memory SQLite database for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession):
    user = User(
        username="admin",
        email="admin@test.com",
        password_hash="hashed",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def director_user(db_session: AsyncSession):
    user = User(
        username="director",
        email="director@test.com",
        password_hash="hashed",
        role=UserRole.DIRECTOR,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def operator_user(db_session: AsyncSession):
    user = User(
        username="operator",
        email="operator@test.com",
        password_hash="hashed",
        role=UserRole.OPERATOR,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def customer_user(db_session: AsyncSession):
    user = User(
        username="customer",
        email="customer@test.com",
        password_hash="hashed",
        role=UserRole.CUSTOMER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def accountant_user(db_session: AsyncSession):
    user = User(
        username="accountant",
        email="accountant@test.com",
        password_hash="hashed",
        role=UserRole.ACCOUNTANT,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    return user


# ─── Test 1: Admin sees all general messages ───


@pytest.mark.asyncio
async def test_admin_sees_all_general_messages(db_session: AsyncSession, admin_user, operator_user, customer_user):
    """Admin sees ALL messages in general chat, regardless of sender."""
    # Create messages from different senders
    m1 = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="Operator msg")
    m2 = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="Customer msg")
    m3 = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="Admin msg")
    db_session.add_all([m1, m2, m3])
    await db_session.commit()

    messages = await get_visible_messages(db_session, admin_user, chat_type=ChatType.GENERAL)
    ids = [m.id for m in messages]
    assert m1.id in ids
    assert m2.id in ids
    assert m3.id in ids
    assert len(ids) == 3


# ─── Test 2: Director sees all general messages ───


@pytest.mark.asyncio
async def test_director_sees_all_general_messages(db_session: AsyncSession, director_user, operator_user, customer_user):
    """Director sees ALL messages in general chat."""
    m1 = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="Operator msg")
    m2 = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="Customer msg")
    db_session.add_all([m1, m2])
    await db_session.commit()

    messages = await get_visible_messages(db_session, director_user, chat_type=ChatType.GENERAL)
    assert len(messages) == 2


# ─── Test 3: Operator sees all general messages ───


@pytest.mark.asyncio
async def test_operator_sees_all_general_messages(db_session: AsyncSession, operator_user, customer_user):
    """Operator sees ALL messages in general chat."""
    m1 = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="Operator msg")
    m2 = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="Customer msg")
    db_session.add_all([m1, m2])
    await db_session.commit()

    messages = await get_visible_messages(db_session, operator_user, chat_type=ChatType.GENERAL)
    assert len(messages) == 2


# ─── Test 4: Customer sees only own + mentioned + replies to own ───


@pytest.mark.asyncio
async def test_customer_sees_own_mentioned_replies(db_session: AsyncSession, customer_user, operator_user, admin_user):
    """Customer sees own messages, messages where they're mentioned, and replies to their own messages."""
    # Customer's own message
    own_msg = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="Own msg")
    db_session.add(own_msg)
    await db_session.flush()

    # Message mentioning the customer
    mention_msg = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="Hey @customer")
    db_session.add(mention_msg)
    await db_session.flush()
    db_session.add(MessageMention(message_id=mention_msg.id, mentioned_user_id=customer_user.id))
    await db_session.flush()

    # Reply to customer's own message (by operator)
    reply_msg = Message(
        sender_id=operator_user.id,
        chat_type=ChatType.GENERAL,
        content="Reply to you",
        reply_to_id=own_msg.id,
    )
    db_session.add(reply_msg)

    # Unrelated message from admin (customer should NOT see this)
    unrelated = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="Admin-only msg")
    db_session.add(unrelated)

    await db_session.commit()

    messages = await get_visible_messages(db_session, customer_user, chat_type=ChatType.GENERAL)
    ids = [m.id for m in messages]

    assert own_msg.id in ids, "Customer should see own message"
    assert mention_msg.id in ids, "Customer should see message mentioning them"
    assert reply_msg.id in ids, "Customer should see replies to own messages"
    assert unrelated.id not in ids, "Customer should NOT see unrelated admin messages"
    assert len(ids) == 3


# ─── Test 5: Accountant visibility (same as customer) ───


@pytest.mark.asyncio
async def test_accountant_sees_own_mentioned_replies(db_session: AsyncSession, accountant_user, operator_user, admin_user):
    """Accountant visibility rules match customer."""
    own_msg = Message(sender_id=accountant_user.id, chat_type=ChatType.GENERAL, content="Own msg")
    db_session.add(own_msg)
    await db_session.flush()

    mention_msg = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="Hey accountant")
    db_session.add(mention_msg)
    await db_session.flush()
    db_session.add(MessageMention(message_id=mention_msg.id, mentioned_user_id=accountant_user.id))

    unrelated = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="Admin msg")
    db_session.add(unrelated)
    await db_session.commit()

    messages = await get_visible_messages(db_session, accountant_user, chat_type=ChatType.GENERAL)
    ids = [m.id for m in messages]

    assert own_msg.id in ids
    assert mention_msg.id in ids
    assert unrelated.id not in ids


# ─── Test 6: Personal chat visibility ───


@pytest.mark.asyncio
async def test_personal_chat_visibility(db_session: AsyncSession, admin_user, customer_user, operator_user):
    """Personal chat messages: only admin/director can see; participants can see."""
    # Personal chat from admin to customer
    personal_msg = Message(
        sender_id=admin_user.id,
        chat_type=ChatType.PERSONAL,
        chat_id=customer_user.id,
        content="Personal msg from admin",
    )
    # Personal chat message from customer
    personal_reply = Message(
        sender_id=customer_user.id,
        chat_type=ChatType.PERSONAL,
        chat_id=admin_user.id,
        content="Personal reply from customer",
    )
    # General message
    general_msg = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="General msg")
    db_session.add_all([personal_msg, personal_reply, general_msg])
    await db_session.commit()

    # Admin sees personal (as sender) + general
    admin_msgs = await get_visible_messages(db_session, admin_user)
    admin_ids = [m.id for m in admin_msgs]
    assert personal_msg.id in admin_ids, "Admin should see personal msg they sent"
    assert personal_reply.id in admin_ids, "Admin should see personal msg where chat_id matches"
    assert general_msg.id in admin_ids, "Admin should see general messages"

    # Customer sees personal (as sender/chat_id) + general
    customer_msgs = await get_visible_messages(db_session, customer_user)
    customer_ids = [m.id for m in customer_msgs]
    assert personal_msg.id in customer_ids, "Customer should see personal msg where chat_id matches them"
    assert personal_reply.id in customer_ids, "Customer should see personal msg they sent"
    assert general_msg.id not in customer_ids, "Customer should NOT see unrelated general messages from others"

    # Operator (not a participant) should NOT see personal messages
    operator_msgs = await get_visible_messages(db_session, operator_user)
    operator_ids = [m.id for m in operator_msgs]
    assert personal_msg.id not in operator_ids, "Operator should NOT see personal msg"
    assert personal_reply.id not in operator_ids, "Operator should NOT see personal msg"
    assert general_msg.id in operator_ids, "Operator should see general messages"


# ─── Test 7: create_message with mentions ───


@pytest.mark.asyncio
async def test_create_message_with_mentions(db_session: AsyncSession, admin_user, customer_user, operator_user):
    """create_message creates message and mention records."""
    msg = await create_message(
        db_session,
        sender_id=admin_user.id,
        chat_type=ChatType.GENERAL,
        content="Hello team",
        mention_ids=[customer_user.id, operator_user.id],
    )
    await db_session.commit()

    assert msg.id is not None
    assert msg.sender_id == admin_user.id
    assert msg.content == "Hello team"

    # Verify mentions were created
    result = await db_session.execute(
        select(MessageMention).where(MessageMention.message_id == msg.id)
    )
    mentions = list(result.scalars().all())
    mentioned_ids = {m.mentioned_user_id for m in mentions}
    assert mentioned_ids == {customer_user.id, operator_user.id}


# ─── Test 8: create_message without mentions ───


@pytest.mark.asyncio
async def test_create_message_without_mentions(db_session: AsyncSession, admin_user):
    """create_message works without mention_ids."""
    msg = await create_message(
        db_session,
        sender_id=admin_user.id,
        chat_type=ChatType.GENERAL,
        content="Simple msg",
    )
    await db_session.commit()

    assert msg.id is not None
    result = await db_session.execute(
        select(MessageMention).where(MessageMention.message_id == msg.id)
    )
    mentions = list(result.scalars().all())
    assert len(mentions) == 0


# ─── Test 9: create_message with reply ───


@pytest.mark.asyncio
async def test_create_message_with_reply(db_session: AsyncSession, admin_user, operator_user):
    """create_message correctly sets reply_to_id."""
    original = await create_message(db_session, sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="Original")
    await db_session.commit()

    reply = await create_message(
        db_session,
        sender_id=operator_user.id,
        chat_type=ChatType.GENERAL,
        content="Reply",
        reply_to_id=original.id,
    )
    await db_session.commit()

    assert reply.reply_to_id == original.id


# ─── Test 10: get_unread_count for admin (sees all) ───


@pytest.mark.asyncio
async def test_unread_count_admin(db_session: AsyncSession, admin_user, operator_user, customer_user):
    """Admin unread count includes all messages after last_active."""
    admin_user.last_active = datetime(2024, 1, 1, tzinfo=timezone.utc)
    await db_session.commit()

    m1 = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="msg1")
    m2 = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="msg2")
    m3 = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="own msg (excluded)")
    db_session.add_all([m1, m2, m3])
    await db_session.commit()

    count = await get_unread_count(db_session, admin_user)
    # own message excluded (sender_id != user.id filter)
    assert count == 2


# ─── Test 11: get_unread_count for customer (restricted) ───


@pytest.mark.asyncio
async def test_unread_count_customer(db_session: AsyncSession, customer_user, operator_user, admin_user):
    """Customer unread count only includes visible messages after last_active."""
    customer_user.last_active = datetime(2024, 1, 1, tzinfo=timezone.utc)
    await db_session.commit()

    # Own message (excluded by sender_id != user.id)
    own = Message(sender_id=customer_user.id, chat_type=ChatType.GENERAL, content="own")
    db_session.add(own)
    await db_session.flush()

    # Mentioning customer
    mentioned = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="@customer")
    db_session.add(mentioned)
    await db_session.flush()
    db_session.add(MessageMention(message_id=mentioned.id, mentioned_user_id=customer_user.id))

    # Reply to customer's message
    reply = Message(sender_id=operator_user.id, chat_type=ChatType.GENERAL, content="reply", reply_to_id=own.id)
    db_session.add(reply)

    # Unrelated message from admin
    unrelated = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="nope")
    db_session.add(unrelated)

    await db_session.commit()

    count = await get_unread_count(db_session, customer_user)
    # Only mentioned + reply should count (own excluded by sender_id != user.id)
    assert count == 2


# ─── Test 12: get_unread_count returns 0 when no last_active ───


@pytest.mark.asyncio
async def test_unread_count_no_last_active(db_session: AsyncSession, customer_user):
    """Unread count is 0 when user has no last_active."""
    customer_user.last_active = None
    await db_session.commit()

    count = await get_unread_count(db_session, customer_user)
    assert count == 0


# ─── Test 13: Pagination (before, offset, limit) ───


@pytest.mark.asyncio
async def test_pagination(db_session: AsyncSession, admin_user):
    """Messages support before, offset, and limit parameters."""
    for i in range(10):
        db_session.add(Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content=f"msg{i}"))
    await db_session.commit()

    # All messages
    all_msgs = await get_visible_messages(db_session, admin_user, chat_type=ChatType.GENERAL)
    assert len(all_msgs) == 10

    # Limit
    limited = await get_visible_messages(db_session, admin_user, chat_type=ChatType.GENERAL, limit=3)
    assert len(limited) == 3

    # Offset
    offset_msgs = await get_visible_messages(db_session, admin_user, chat_type=ChatType.GENERAL, limit=5, offset=5)
    assert len(offset_msgs) == 5

    # Before
    before_msgs = await get_visible_messages(db_session, admin_user, chat_type=ChatType.GENERAL, before=all_msgs[4].id)
    # Should return messages with id < all_msgs[4].id
    assert all(m.id < all_msgs[4].id for m in before_msgs)


# ─── Test 14: Customer does not see replies to OTHER people's messages ───


@pytest.mark.asyncio
async def test_customer_does_not_see_replies_to_others(db_session: AsyncSession, customer_user, operator_user, admin_user):
    """Customer should NOT see replies to messages they did not send."""
    # Admin's message
    admin_msg = Message(sender_id=admin_user.id, chat_type=ChatType.GENERAL, content="Admin msg")
    db_session.add(admin_msg)
    await db_session.flush()

    # Reply to admin's message (customer is not involved)
    reply = Message(
        sender_id=operator_user.id,
        chat_type=ChatType.GENERAL,
        content="Reply to admin",
        reply_to_id=admin_msg.id,
    )
    db_session.add(reply)
    await db_session.commit()

    messages = await get_visible_messages(db_session, customer_user, chat_type=ChatType.GENERAL)
    ids = [m.id for m in messages]
    assert reply.id not in ids, "Customer should NOT see reply to admin's message"
    assert admin_msg.id not in ids, "Customer should NOT see admin's unrelated message"
