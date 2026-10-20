"use strict";(()=>{var T=0;function A(i){let t;do t=`details-group-${++T}`;while(i.ownerDocument?.getElementsByName(t).length);return t}function E(i,t=!0){let e=i.querySelectorAll(":scope > details");if(!e.length)return;let o=A(i);e.forEach(n=>{n.setAttribute("name",o),n.setAttribute("data-accordion","false")}),i.classList.contains("tabbed-content_tabs")&&!Array.from(e).some(n=>n.open)&&(e[0].open=!0),t||e.forEach(n=>{n.addEventListener("toggle",()=>{n.open&&e.forEach(r=>{r!==n&&(r.open=!1)})})})}function c(i=document,t="name"in document.createElement("details")){let e=new Set;i.querySelectorAll("details").forEach(o=>{let n=o.parentElement;!n||e.has(n)||n.getAttribute("data-details-group")!=="false"&&(n.querySelectorAll(":scope > details").length<2||e.add(n))}),e.forEach(o=>E(o,t))}var l=class{DATA_ATTR="data-dialog-id";DATA_ATTR_OPEN="data-dialog-open";DATA_ATTR_CLOSE="data-dialog-close";DATA_COMPONENT_SELECTOR=`dialog[${this.DATA_ATTR}]`;initializedIds=new Set;constructor(){this.init(),this.handleBackdropClick()}init(){document.querySelectorAll(this.DATA_COMPONENT_SELECTOR).forEach(e=>{let o=e.getAttribute(this.DATA_ATTR);if(!o){console.error("No ID found for dialog component",e);return}if(this.initializedIds.has(o)){console.warn(`Duplicate dialog ID "${o}" found. Skipping initialization.`,e);return}this.initializedIds.add(o);let n=document.querySelectorAll(`[${this.DATA_ATTR_OPEN}="${o}"]`),r=e.querySelectorAll(`[${this.DATA_ATTR_CLOSE}="${o}"]`);n.forEach(a=>{a.addEventListener("click",()=>{this.openDialog(e)})}),r.forEach(a=>{a.addEventListener("click",h=>{h.stopPropagation(),this.closeDialog(e)})}),e.addEventListener("close",a=>{this.closeDialog(e,!0)})})}openDialog(t){t.showModal();let e=new CustomEvent("dialogOpen",{detail:{dialogId:t.getAttribute(this.DATA_ATTR)}});t.dispatchEvent(e)}closeDialog(t,e=!1){e||t.close();let o=new CustomEvent("dialogClose",{detail:{dialogId:t.getAttribute(this.DATA_ATTR)}});t.dispatchEvent(o)}handleBackdropClick(){document.querySelectorAll("dialog").forEach(e=>{e.addEventListener("click",o=>{let n=o.target;if(!(n instanceof HTMLDialogElement))return;let r=n.getBoundingClientRect();r.top<=o.clientY&&o.clientY<=r.top+r.height&&r.left<=o.clientX&&o.clientX<=r.left+r.width&&o.target===n&&this.closeDialog(n)})})}},d=l;function u(){let i=document.querySelectorAll('[data-el="current-year"]'),t=new Date().getFullYear().toString();i.forEach(e=>{e.textContent=t})}function m(){window.jQuery?.(document).off("click.wf-scroll")}var w=()=>{document.querySelectorAll('a[data-external="yes"], a[data-external="true"], a[data-external="1"]').forEach(t=>{t.setAttribute("target","_blank")})},f=w;function s(){let i=document.querySelector("main");i&&(i.id="main")}const MARQUEE_SPEED = 76.8;

function p() {
  document.querySelectorAll('[data-el="marquee-list"]').forEach((list) => {
    if (list.dataset.marqueeReady) return;
    const track = list.parentElement;
    if (!track) return;
    list.dataset.marqueeReady = 'true';
    list.style.flex = '0 0 auto';
    const originals = Array.from(list.children);
    const repeats = [];
    let clone;
    let frame = 0;
    let lastWidth = 0;
    let lastUnit = 0;
    let container = track.parentElement;
    while (container && getComputedStyle(container).display === 'contents') {
      container = container.parentElement;
    }
    if (!container) return;
    const viewport = container;

    const decorate = (copy) => {
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      return copy;
    };
    const build = () => {
      frame = 0;
      const width = viewport.getBoundingClientRect().width;
      const unit = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const sequence = unit + gap * originals.length;
      if (!width || !sequence || (width === lastWidth && sequence === lastUnit)) return;
      lastWidth = width;
      lastUnit = sequence;
      clone?.remove();
      repeats.forEach((el) => el.remove());
      repeats.length = 0;
      const count = Math.max(1, Math.ceil((width + gap) / sequence));
      for (let i = 1; i < count; i++) {
        originals.forEach((el) => {
          const copy = decorate(el.cloneNode(true));
          list.append(copy);
          repeats.push(copy);
        });
      }
      const duration = `${(sequence * count) / MARQUEE_SPEED}s`;
      list.style.animation = 'none';
      list.style.animationDuration = duration;
      clone = decorate(list.cloneNode(true));
      clone.removeAttribute('data-el');
      track.insertBefore(clone, list.nextSibling);
      void track.offsetWidth;
      list.style.removeProperty('animation');
      clone.style.removeProperty('animation');
      list.style.animationDuration = duration;
      clone.style.animationDuration = duration;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    originals.forEach((el) => observer.observe(el));
    list.querySelectorAll('img').forEach((img) => img.addEventListener('load', schedule));
    document.fonts.ready.then(schedule);
    build();
  });
}
var L="query",S='[data-el="search-result-text"]';function g(){let i=new URLSearchParams(window.location.search).get(L);i&&document.querySelectorAll(S).forEach(t=>{t.textContent=i})}window.Webflow=window.Webflow||[];window.Webflow?.push(()=>{setTimeout(()=>{window.WF_IX=Webflow.require("ix3"),console.debug("Webflow IX3 globalised:",window.WF_IX)},100),u(),s(),f(),g(),D(),b(),_(),v()});function D(){new d,window.conditionalLoadScript('[data-video-controller="starter-native-v1"]',"components/native-video.js")}function b(){p(),c(),window.conditionalLoadScript('[data-el="switching-tabs-component"], .switcing-tabs_component, .switching-tabs_component',"components/switching-tabs.js")}function _(){m()}function v(){window.loadScript("https://flackr.github.io/scroll-timeline/dist/scroll-timeline.js")}})();
