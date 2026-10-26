(function () {
  'use strict';

  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* Photos: each slot names its file; the placeholder stays until the file loads */
  document.querySelectorAll('[data-photo]').forEach(function (el) {
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url("' + img.src + '")';
      el.classList.add('has-photo');
      var hero = el.closest('.hero');
      if (hero) hero.classList.add('has-photo');
    };
    img.src = el.getAttribute('data-photo');
  });

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
