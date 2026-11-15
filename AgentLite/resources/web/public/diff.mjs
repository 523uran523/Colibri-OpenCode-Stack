// Diff modal logic — loaded lazily on demand via dynamic import()
// so the main bundle never pays for it.
export function showDiff(ev, openModal) {
  const $id = id => document.getElementById(id);
  $id('diff-title').textContent = `Diff: ${ev.path || 'файл'} (${ev.operation || 'edit'})`;
  $id('diff-old').textContent = ev.old != null && ev.old !== '' ? ev.old : '(новый файл)';
  $id('diff-new').textContent = ev.new ?? '';
  openModal('diff');
}
