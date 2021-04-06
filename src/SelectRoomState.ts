export function selectRoomState(state: any, path:(number|string)[] = []) {
    for (const step of path) {
        if (state == null) throw new Error("wrong path selector");
        if (Array.isArray(state)) {
            if (typeof step !== "number") throw new Error("wrong path selector");
            state = state[step]
        } else if (state && typeof state === "object"){
            if (typeof step !== "string") throw new Error("wrong path selector");
            // prevent prototype pollution for objects
            if (Object.prototype.hasOwnProperty.call(state, step)) {
                state = state[step];
            } else {
                state = undefined;
            }
        } else {
            throw new Error("wrong path selector");
        }
    }
    return state;
}