// Автоматическая смена картинок в слайдере
const slides = document.querySelectorAll('.slide');
let currentSlide = 0;
const slideInterval = 4000; // Время показа одного фото (4 секунды)

function nextSlide() {
    // Убираем класс active у текущего фото
    slides[currentSlide].classList.remove('active');

    // Считаем индекс следующего фото
    currentSlide = (currentSlide + 1) % slides.length;

    // Добавляем класс active новому фото
    slides[currentSlide].classList.add('active');
}

// Запускаем автоматическое переключение
setInterval(nextSlide, slideInterval);
