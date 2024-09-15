interface Timestamped {
  readonly timestamp: number;
}
export class MinHeap<T extends Timestamped> {
  private heap: T[];

  constructor() {
    this.heap = [];
  }

  private parentIndex(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  private leftChildIndex(i: number): number {
    return 2 * i + 1;
  }

  private rightChildIndex(i: number): number {
    return 2 * i + 2;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  private heapifyUp(index: number): void {
    let parent = this.parentIndex(index);
    while (index > 0 && this.heap[parent].timestamp > this.heap[index].timestamp) {
      this.swap(parent, index);
      index = parent;
      parent = this.parentIndex(index);
    }
  }

  private heapifyDown(index: number): void {
    let smallest = index;
    let left = this.leftChildIndex(index);
    let right = this.rightChildIndex(index);

    if (left < this.heap.length && this.heap[left].timestamp < this.heap[smallest].timestamp) {
      smallest = left;
    }
    if (right < this.heap.length && this.heap[right].timestamp < this.heap[smallest].timestamp) {
      smallest = right;
    }
    if (smallest !== index) {
      this.swap(index, smallest);
      this.heapifyDown(smallest);
    }
  }

  insert(data: T): void {
    this.heap.push(data);
    this.heapifyUp(this.heap.length - 1);
  }

  extractMin(): T | null {
    if (this.heap.length === 0) {
      return null;
    }
    if (this.heap.length === 1) {
      return this.heap.pop()!;
    }

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);

    return min;
  }

  peek(): T | null {
    return this.heap.length === 0 ? null : this.heap[0];
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }

  verifyHeap(): boolean {
    for (let i = 0; i < this.heap.length; i++) {
      const left = this.leftChildIndex(i);
      const right = this.rightChildIndex(i);
      if (left < this.heap.length && this.heap[left].timestamp < this.heap[i].timestamp) {
        return false;
      }
      if (right < this.heap.length && this.heap[right].timestamp < this.heap[i].timestamp) {
        return false;
      }
    }
    return true;
  }
}
