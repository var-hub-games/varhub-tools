type EventTypes = {
    [key: string]: Event
}
interface TEventListener<T extends Event> {
    (event: T): void
}
interface TEventListenerObject<T extends Event> {
    handleEvent(event: T): void;
}
type TEventListenerOrEventListenerObject<T extends Event> = TEventListener<T> | TEventListenerObject<T>;

export class TypedEventTarget<T extends EventTypes> {
    #target = new EventTarget();

    addEventListener<N extends string & keyof T>(
        type: N,
        listener: TEventListenerOrEventListenerObject<T[N]> | null,
        options?: boolean | AddEventListenerOptions
    ): () => void {
        this.#target.addEventListener(type, listener, options);
        return () => this.removeEventListener(type, listener, options)
    }

    removeEventListener<N extends string & keyof T>(
        type: N,
        listener: TEventListenerOrEventListenerObject<T[N]> | null,
        options?: boolean | AddEventListenerOptions
    ): void {
        this.#target.removeEventListener(type, listener, options);
    }

    protected dispatchEvent(event: T[keyof T]): boolean {
        return this.#target.dispatchEvent(event);
    }
}