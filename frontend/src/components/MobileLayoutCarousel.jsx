import { useState, useRef, useCallback } from 'react';

export default function MobileLayoutCarousel({ layouts, appId, onLayoutClick, onActiveIndexChange }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const threshold = 50;
    if (touchDeltaX.current < -threshold && activeIndex < layouts.length - 1) {
      setActiveIndex(prev => {
        onActiveIndexChange?.(prev + 1);
        return prev + 1;
      });
    } else if (touchDeltaX.current > threshold && activeIndex > 0) {
      setActiveIndex(prev => {
        onActiveIndexChange?.(prev - 1);
        return prev - 1;
      });
    }
    touchDeltaX.current = 0;
  }, [activeIndex, layouts.length, onActiveIndexChange]);

  if (!layouts || layouts.length === 0) {
    return (
      <div className="order-card-no-image">Нет изображения</div>
    );
  }

  const layout = layouts[activeIndex];

  return (
    <div className="carousel-container">
      <div
        ref={containerRef}
        className="carousel-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => onLayoutClick(activeIndex)}
      >
        <img
          className="carousel-image"
          src={layout.layout_image}
          alt={`Раскладка ${appId}.${layout.layout_code}`}
          loading="lazy"
        />
      </div>
      {layouts.length > 1 && (
        <div className="carousel-dots">
          {layouts.map((_, i) => (
            <span
              key={i}
              className={'carousel-dot' + (i === activeIndex ? ' active' : '')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
