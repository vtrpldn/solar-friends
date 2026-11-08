// Small minimum-cost queue for resident road routing.
export class PathQueue {
  items = [];
  push(value) {
    let i = this.items.length;
    this.items.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].priority <= value.priority) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = value;
  }
  pop() {
    const first = this.items[0],
      last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (
          c + 1 < this.items.length &&
          this.items[c + 1].priority < this.items[c].priority
        )
          c++;
        if (this.items[c].priority >= last.priority) break;
        this.items[i] = this.items[c];
        i = c;
      }
      this.items[i] = last;
    }
    return first;
  }
  get length() {
    return this.items.length;
  }
}
