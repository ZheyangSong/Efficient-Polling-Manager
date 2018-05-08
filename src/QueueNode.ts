export class QueueNode<V = any> {
  constructor(
    private _key: number | string,
    private _val: V,
  ) {}

  public get key() {
    return this._key;
  }

  public get value() {
    return this._val;
  }
}
