# LaserCut Core — Текущий план

## Статус: Остановка на 2026-06-15

## Что реализовано
1. ✅ Парсинг заявок и раскладок (unified_parser.py)
2. ✅ Извлечение изображений с привязкой к деталям
3. ✅ Вес деталей (пересчёт при обновлении толщины)
4. ✅ RBAC: авторизация, фильтрация по ролям
5. ✅ Статусы заявок (pending/in_progress/partially_cut/cut)
6. ✅ Приоритеты (low/medium/high/urgent) через select, правильная сортировка
7. ✅ Уведомления (in-app, колокольчик)
8. ✅ История изменений (ChangeLog)
9. ✅ Дефицит металла (CRUD + уведомления, standalone + per-application)
10. ✅ Поиск по деталям с подсветкой
11. ✅ Фильтры-выпадашки в таблице
12. ✅ Заказчики видят только свои заявки
13. ✅ Аудит (лог действий)
14. ✅ Статистика активности пользователей (онлайн, модалка с табами)
15. ✅ Склад металла (CRUD)
16. ✅ Дав. мат (да/нет/—) в заявках и форме добавления
17. ✅ Таблица истории выполненных заявок с кнопкой отмены
18. ✅ cut_at / cut_by поля для отслеживания кто и когда вырезал

## Что осталось
1. ⬜ Дополнительные роли и вкладки (по мере развития)
2. ⬜ Обновить тесты под новые endpoints
3. ⬜ Автоочистка старых уведомлений
4. ⬜ Очистка старых записей UserActivity

## Ключевые файлы
- `app/db/models.py` — все модели БД
- `app/api/v1/router_applications.py` — API заявок
- `app/api/v1/router_warehouse.py` — API склада
- `app/api/users.py` — API пользователей + статистика
- `app/core/deps.py` — авторизация + last_active
- `frontend/src/pages/Applications/ApplicationsList.jsx` — главная таблица + история
- `frontend/src/pages/Users/UsersList.jsx` — список пользователей
- `frontend/src/pages/Users/UserActivityModal.jsx` — модалка активности
- `frontend/src/pages/Warehouse/Warehouse.jsx` — склад
- `frontend/src/pages/Deficit.jsx` — дефицит
