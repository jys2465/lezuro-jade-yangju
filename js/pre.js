/* 화면을 그리기 전에 먼저 실행: 화면 모드(밝게·어둡게) 정하기 + 시작 감시 */
(function () {
  /* 하얗게 번쩍이지 않게 화면 모드를 먼저 정함 */
  var m; try { m = localStorage.getItem('lz.theme'); } catch (e) { m = null; }
  var d = m === 'dark' || (m !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = d ? 'dark' : 'light';
  var t = document.querySelector('meta[name="theme-color"]'); if (t) t.content = d ? '#17191E' : '#FFFFFF';
  document.addEventListener('DOMContentLoaded', function () { var b = document.querySelector('#boot img'); if (b && d) b.src = 'assets/logo-dark.png'; });

  /* 6초 안에 앱이 시작하지 못하면 이유를 화면에 알려 줌 */
  var failed = [], errs = [];
  window.addEventListener('error', function (e) {
    var x = e.target;
    if (x && x !== window && (x.src || x.href)) failed.push((x.src || x.href).replace(location.origin, ''));
    else if (e.message) errs.push(e.message);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { errs.push(String((e.reason && e.reason.message) || e.reason)); });
  setTimeout(function () {
    if (window.LZ && window.LZ.booted) return;
    var el = document.getElementById('boot'); if (!el) return;
    var h = '<h2>앱을 시작하지 못했어요</h2><p>';
    if (failed.length) h += '불러오지 못한 파일 ' + failed.length + '개:<br><b>' + failed.slice(0, 6).join('<br>').replace(/[<>&"]/g, '') + '</b><br><br>GitHub 저장소에 css, js, assets, icons 폴더와 그 안의 파일이 모두 올라갔는지 확인해 주세요.';
    else if (errs.length) h += '오류: <b>' + String(errs[0]).replace(/[<>&"]/g, '') + '</b>';
    else h += '시작이 늦어지고 있어요. 인터넷이 느린지 확인하고 다시 시도해 주세요.';
    el.innerHTML = h + '</p><button class="btn" id="bootRetry" style="max-width:260px">다시 시도</button>';
    var r = document.getElementById('bootRetry'); if (r) r.addEventListener('click', function () { location.reload(); });
  }, 6000);
})();
