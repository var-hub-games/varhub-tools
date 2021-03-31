try {
    delete Object.prototype['__proto__'];
} catch {}

export function reduceRoomState(state: any, data: any, path:(number|string)[]) {
    const [currentStep, ...nextPath] = path;
    if (!currentStep) return data;
    if (Array.isArray(state)) {
        if (typeof currentStep !== "number") throw new Error("state update error");
        if (nextPath.length === 0 && data === undefined) { // delete index
            if (state.length >= currentStep) return state;
            const modState = state.slice(0);
            modState.splice(currentStep, 1);
            return modState;
        } else { // edit index
            const val = state[currentStep];
            const nextVal = reduceRoomState(val, data, nextPath);
            if (Object.is(val, nextVal)) return state;
            const modState = state.slice(0);
            modState[Number(currentStep)] = nextVal;
            return modState;
        }
    } else if (state != null && typeof state === "object"){
        if (typeof currentStep !== "string") throw new Error("state update error");
        if (nextPath.length === 0 && data === undefined) { // delete key
            if (!Object.prototype.hasOwnProperty.call(state, currentStep)) return state;
            const {[currentStep]: ignored, ...modState} = state;
            return modState;
        } else { // edit key
            const val = state[currentStep];
            const nextVal = reduceRoomState(state[currentStep], data, nextPath);
            if (Object.is(val, nextVal)) return state;
            return {...state, [currentStep]: nextVal};
        }
    }
    throw new Error("state update error");
}