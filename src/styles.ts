// The Shadow DOM's CSS. The page's styles can't reach inside, and these can't leak out. Theme tokens are set on the
// wrapper, which holds the dialog too (not on :host, which the page's own rules would override); --l21-on-accent is computed in
// code so text on any accent stays readable.
export const css = `
.w{
  --a:var(--l21-accent,#6d28d9);--oa:var(--l21-on-accent,#fff);--r:var(--l21-radius,10px);
  --bg:#fff;--fg:#1c1b1f;--mu:#5f5b66;--ln:#d6d2dc;--sf:#f5f3f8;--er:#b3261e;--ok:#146c2e;
  font:15px/1.4 var(--l21-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:var(--fg);
  box-sizing:border-box;text-align:left;letter-spacing:normal;text-transform:none
}
.dark{--bg:#1d1b20;--fg:#e8e3ec;--mu:#b5aec0;--ln:#49454f;--sf:#2a2730;--er:#f2b8b5;--ok:#7dd99a}
@media (prefers-color-scheme:dark){.auto{--bg:#1d1b20;--fg:#e8e3ec;--mu:#b5aec0;--ln:#49454f;--sf:#2a2730;--er:#f2b8b5;--ok:#7dd99a}}
*,*::before,*::after{box-sizing:border-box}
.w{display:inline-flex;flex-direction:column;align-items:center;gap:4px;background:none}
button,input,select,p{font:inherit;color:inherit;margin:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 20px;border:0;
  border-radius:var(--r);background:var(--a);color:var(--oa);font-weight:600;cursor:pointer;text-decoration:none;width:auto}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.btn.sec{background:transparent;color:var(--fg);border:1px solid var(--ln)}
.btn.full{width:100%}
:focus-visible{outline:3px solid var(--a);outline-offset:2px}
.pr{font-size:13px;color:var(--mu)}
.sub{font-size:13px;color:var(--mu);margin:0}
dialog{background:var(--bg);color:var(--fg);font:inherit;border:0;border-radius:calc(var(--r) + 6px);padding:0;width:min(440px,calc(100vw - 32px));
  max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.35)}
dialog::backdrop{background:rgba(0,0,0,.5)}
.hd{display:flex;gap:12px;align-items:center;padding:16px 16px 8px}
.hd img{width:56px;height:56px;object-fit:cover;border-radius:8px;background:var(--sf);flex:none}
.hd h2{font-size:17px;margin:0;font-weight:600}
.x{margin-left:auto;align-self:flex-start;background:none;border:0;font-size:24px;line-height:1;width:44px;height:44px;
  border-radius:50%;cursor:pointer;color:var(--mu);flex:none}
.bd{padding:8px 16px 16px;display:grid;gap:12px}
label{display:grid;gap:4px;font-size:13px;color:var(--mu)}
input,select{width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--ln);border-radius:8px;background:var(--bg);color:var(--fg);font-size:16px}
[aria-invalid=true]{border-color:var(--er);border-width:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.qty{display:flex;align-items:center;gap:8px}
.qty input{width:72px;text-align:center}
.qty button{width:44px;height:44px;border:1px solid var(--ln);border-radius:8px;background:var(--sf);cursor:pointer;font-size:20px}
fieldset{border:0;padding:0;margin:0;display:grid;gap:6px}
legend{font-size:13px;color:var(--mu);margin-bottom:4px;padding:0}
.opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--ln);border-radius:8px;color:var(--fg);font-size:15px;cursor:pointer}
.opt:has(input:checked){border-color:var(--a);box-shadow:inset 0 0 0 1px var(--a)}
.opt input{width:18px;min-height:18px;margin:0;accent-color:var(--a)}
.sum{background:var(--sf);border-radius:8px;padding:10px 12px;display:grid;gap:4px;font-size:14px}
.sum div{display:flex;justify-content:space-between;gap:12px}
.sum .tot{font-weight:600;font-size:16px}
.err{color:var(--er);margin:0;font-size:14px}
.err:empty{display:none}
.ok{color:var(--ok);font-weight:600}
.qr{background:#fff;padding:8px;border-radius:8px;width:min(280px,100%);justify-self:center}
.qr svg{display:block;width:100%;height:auto}
.cen{text-align:center;justify-items:center}
.qrb{display:grid;gap:8px;width:100%}
.lnk{background:none;border:0;color:var(--fg);text-decoration:underline;cursor:pointer;padding:8px;font-size:14px}
.acts{display:grid;gap:8px}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;color:var(--mu)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ft{padding:0 16px 14px;text-align:center;font-size:12px;color:var(--mu)}
.ft a{color:inherit}
@media (max-width:480px){
  dialog{width:100vw;max-width:100vw;max-height:100dvh;height:100dvh;margin:0;border-radius:0}
  .qrb{order:1}
}
@media (prefers-reduced-motion:no-preference){dialog[open]{animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(12px)}}}
`;

/** Black or white, whichever reads better on the colour (WCAG contrast); the colour as getComputedStyle gives it. */
export function textOn(color: string): '#000' | '#fff' {
  const [r, g, b] = (color.match(/[\d.]+/g) || ['109', '40', '217']).slice(0, 3).map(Number);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000' : '#fff';
}
