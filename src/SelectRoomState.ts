export function selectRoomState(state: any, path:(number|string)[] = []) {
    for (const step of path) {
        if (state == null) throw new Error("wrong path selector");
        if (Array.isArray(state)) {
            if (typeof step !== "number") throw new Error("wrong path selector");
        } else {
            if (typeof step !== "string") throw new Error("wrong path selector");
            if (!Object.prototype.hasOwnProperty.call(state, step)) throw new Error("wrong path selector");
        }
        state = state[step];
    }
    return state;
}