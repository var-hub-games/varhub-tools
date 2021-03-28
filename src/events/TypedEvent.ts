export class TypedEvent<T extends string> extends Event {
    constructor(type: T, params: EventInit) {
        super(type, params);
    }
}

export class TypedCustomEvent<T extends string, D> extends CustomEvent<D> {
    constructor(type: T, params: CustomEventInit<D>) {
        super(type, params);
    }
}

export type AnyTypedEvent<T extends string> = TypedEvent<T> | TypedCustomEvent<T, any>