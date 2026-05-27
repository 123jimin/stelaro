/**
 * Binary min-heap ordered by a comparator function.
 *
 * @typeParam T - Element type
 * @category Utility
 */
export class MinHeap<T> {
    readonly #compare: (a: T, b: T) => number;
    readonly #data: T[] = [];

    /**
     * @param compare - Comparator returning negative if `a` should be popped before `b`
     */
    constructor(compare: (a: T, b: T) => number) {
        this.#compare = compare;
    }

    /** Number of elements in the heap */
    get size(): number {
        return this.#data.length;
    }

    /** Inserts a value into the heap */
    push(value: T): void {
        this.#data.push(value);
        this.#siftUp(this.#data.length - 1);
    }

    /** Removes and returns the minimum element, or `null` if empty */
    pop(): T | null {
        if(this.#data.length === 0) return null;

        const first = this.#data[0]!;
        const last = this.#data.pop()!;

        if(this.#data.length > 0) {
            this.#data[0] = last;
            this.#siftDown(0);
        }

        return first;
    }

    #siftUp(index: number): void {
        while(index > 0) {
            const parent_index = (index - 1) >> 1;
            if(this.#compare(this.#data[index]!, this.#data[parent_index]!) >= 0) break;

            const temp = this.#data[index]!;
            this.#data[index] = this.#data[parent_index]!;
            this.#data[parent_index] = temp;

            index = parent_index;
        }
    }

    #siftDown(index: number): void {
        const length = this.#data.length;

        while(true) {
            let smallest = index;
            const left = 2 * index + 1;
            const right = 2 * index + 2;

            if(left < length && this.#compare(this.#data[left]!, this.#data[smallest]!) < 0) {
                smallest = left;
            }
            if(right < length && this.#compare(this.#data[right]!, this.#data[smallest]!) < 0) {
                smallest = right;
            }
            if(smallest === index) break;

            const temp = this.#data[index]!;
            this.#data[index] = this.#data[smallest]!;
            this.#data[smallest] = temp;

            index = smallest;
        }
    }
}
