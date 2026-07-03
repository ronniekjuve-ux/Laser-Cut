import { useState, useRef, useCallback } from 'react';

export default function MobileLayoutCarousel({ layouts, appId, onLayoutClick, onActiveIndexChange }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hasMoved = useRef(false);
  const touchHandledClick = useRef(false);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    hasMoved.current = false;
  }, []);

  const handleTouchMove = useCallback((e) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > 10 || dy > 10) hasMoved.current = true;
    if (dx > dy) e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;

    if (!hasMoved.current) {
      touchHandledClick.current = true;
      setTimeout(() => { touchHandledClick.current = false; }, 300);
      onLayoutClick(activeIndex);
      return;
    }

    if (Math.abs(dx) > 50) {
      if (dx < -50 && activeIndex < layouts.length - 1) {
        setActiveIndex(prev => {
          onActiveIndexChange?.(prev + 1);
          return prev + 1;
        });
      } else if (dx > 50 && activeIndex > 0) {
        setActiveIndex(prev => {
          onActiveIndexChange?.(prev - 1);
          return prev - 1;
        });
      }
    }
  }, [activeIndex, layouts.length, onActiveIndexChange, onLayoutClick]);

  const handleClick = useCallback(() => {
    if (touchHandledClick.current) return;
    onLayoutClick(activeIndex);
  }, [activeIndex, onLayoutClick]);

  if (!layouts || layouts.length === 0) {
    return <div className="order-card-no-image">Нет изображения</div>;
  }

  const layout = layouts[activeIndex];

  return (
    <div className="carousel-container">
      <div
        className="carousel-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <img
          className="carousel-image"
          src={layout.layout_image}
          alt={`Раскладка ${appId}.${layout.layout_code}`}
          loading="lazy"
          draggable={false}
        />
      </div>
      {layouts.length > 1 && (
        <div className="carousel-dots">
          {layouts.map((_, i) => (
            <span key={i} className={'carousel-dot' + (i === activeIndex ? ' active' : '')} />
          ))}
        </div>
      )}
    </div>
  );
}
