/** 屏幕中央提示：3 秒后自动淡出，同一时刻只保留一条（设计文档 10.4） */
export class Toast {
  private readonly el: HTMLElement;
  private timer: number | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    host.appendChild(this.el);
  }

  show(text: string, ms = 3000): void {
    this.el.textContent = text;
    this.el.classList.add('toast--visible');
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.el.classList.remove('toast--visible');
      this.timer = null;
    }, ms);
  }

  hide(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.el.classList.remove('toast--visible');
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
