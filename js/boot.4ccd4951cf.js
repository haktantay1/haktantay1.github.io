/* Boot (render'ı engelleyen küçük betik, <head> içinde senkron yüklenir).
   Sayfa boyanmadan önce durum sınıflarını koyar ki ilk karede titreme olmasın:
   - .js            : JavaScript var (açılış animasyonlarının başlangıç durumları)
   - .is-preloading : bu oturumdaki ilk ziyaret → preloader gösterilir
   Hareketi azalt tercihinde preloader hiç gösterilmez. */
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && !window.sessionStorage.getItem("yula:intro")) d.classList.add("is-preloading");
  } catch (e) { /* depolama kapalıysa preloader'sız devam */ }
})();
