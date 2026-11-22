/* main.js — titik masuk aplikasi */
(function () {
  'use strict';
  const SIG = window.SIG;

  document.addEventListener('DOMContentLoaded', async () => {
    await SIG.applyState(SIG.loadSaved());

    SIG.ui.init();
    SIG.mapview.init();
    SIG.layout.init();

    // gambar ulang digabung per frame
    let raf = 0;
    SIG.on('redraw', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (SIG.view === 'layout') SIG.layout.redraw(); else SIG.mapview.redraw();
      });
    });
    SIG.on('ui', () => SIG.ui.rebuild());

    SIG.ui.syncInputs();
    SIG.ui.rebuild();
    SIG.ui.setTab('data');
    SIG.mapview.resize();
    SIG.mapview.fit();
  });
})();
