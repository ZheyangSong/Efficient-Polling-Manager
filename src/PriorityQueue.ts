import { QueueNode } from './QueueNode';

type TComp<T> = (a: T, b: T) => number;

const defaultComp = <T>(a: T, b: T) => {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  } else {
    return 0;
  }
}

export class PriorityQueue<V = number> {
  private nodes: QueueNode<V>[] = [];
  private size: number = 0;
  private position: {
    [internalKey: string]: number;
  } = {}; // InternalKey: Index
  private externalKeyCounters: Map<string | number, number> = new Map(); // <External Key, count>

  constructor(
    private comp: TComp<V> = defaultComp,
  ) {}

  public peek = () => this.size > 0 ? this.nodes[0].value : undefined;

  public add = (key: number | string, val: V) => {
    if (!this.externalKeyCounters.has(key)) {
      this.externalKeyCounters.set(key, 0);
    }

    const count = this.externalKeyCounters.get(key) as number;
    const internalKey = this.getInternalKey(key, count);
    const idx = this.size;

    // Add the new node and update book-keeping info
    this.nodes.push(new QueueNode(internalKey, val));
    this.size++;
    this.position[internalKey] = idx;
    this.externalKeyCounters.set(key, count + 1);

    // Restore heap's structure
    this.moveUp(idx);
  }

  public remove = (key: number | string) => {
    const count = this.externalKeyCounters.get(key) as number;

    if (!this.externalKeyCounters.has(key) || count === 0) {
      return undefined;
    } else {
      const lastIdxOfInternalKey = count - 1;
      const internalKey = this.getInternalKey(key, lastIdxOfInternalKey);
      const idx = this.position[internalKey];
      const removedNode = this.nodes[idx];
      
      if (this.size <= 1) { // There is only one node, simply return and reset state.
        this.nodes = [];
        this.size = 0;
        this.position = {};
        this.externalKeyCounters.clear();
      } else {
        // Remove a node labelled by `key` and update book-keeping info
        this.swap(idx, --this.size);
        this.nodes.pop();
        delete this.position[internalKey];
        if (lastIdxOfInternalKey === 0) {
          this.externalKeyCounters.delete(key);
        } else {
          this.externalKeyCounters.set(key, lastIdxOfInternalKey);
        }

        // Restore heap's structure
        this.moveDown(idx);
      }

      return removedNode.value;
    }
  }

  private swap = (idxA: number, idxB: number) => {
    const nodeA = this.nodes[idxA];
    const nodeB = this.nodes[idxB];

    this.nodes[idxA] = this.nodes[idxB];
    this.position[nodeB.key] = idxA; // Node B is moved to idxA

    this.nodes[idxB] = nodeA;
    this.position[nodeA.key] = idxB; // Node A is moved to idxB
  }

  private moveDown = (idx: number) => {
    const parentBoundaryIdx = this.size >> 1;

    while (idx < parentBoundaryIdx) {
      const leftChildIdx = this.getLeftChildIdx(idx);
      const leftChildNode = this.nodes[leftChildIdx];
      const rightChildIdx = this.getRightChildIdx(idx);
      const rightChildNode = this.nodes[rightChildIdx];

      let smallerChildIdx = leftChildIdx;
      let smallerChildNode = leftChildNode;
      if (rightChildIdx < this.size && this.comp(rightChildNode.value, leftChildNode.value) < 0) {
        smallerChildIdx = rightChildIdx;
        smallerChildNode = rightChildNode;
      }

      const parentNode = this.nodes[idx];

      if (this.comp(parentNode.value, smallerChildNode.value) < 0) {
        break;
      }

      this.swap(idx, smallerChildIdx);
      idx = smallerChildIdx;
    }
  }

  private moveUp = (idx: number) => {
    while (idx > 0) {
      const parentIdx = this.getParentIdx(idx);
      const parentNode = this.nodes[parentIdx];
      const childNode = this.nodes[idx];

      if (this.comp(parentNode.value, childNode.value) < 0) {
        break;
      }

      this.swap(idx, parentIdx);
      idx = parentIdx;
    }
  }

  private getInternalKey = (key: number | string, internalKeyIdx: number) => `${key}-${internalKeyIdx}`;

  private getParentIdx = (idx: number) => (idx - 1) >> 1;

  private getLeftChildIdx = (idx: number) => idx * 2 + 1;

  private getRightChildIdx = (idx: number) => idx * 2 + 2;
}
