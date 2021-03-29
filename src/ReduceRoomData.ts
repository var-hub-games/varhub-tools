export function reduceRoomData(state: any, action: ChangeRoomStateAction): any {
    if (!action) return null;
    if (action.type === "update") {
        return reduceState(state, action.data, action.path ?? []);
    }
    return state;
}

function reduceState(state: any, data: any, path:(number|string)[]) {
    const [currentStep, ...nextPath] = path;
    if (!currentStep) return data;
    if (Array.isArray(state)) {
        if (typeof currentStep !== "number") throw new Error("state update error");
        const modState = state.slice(0);
        if (nextPath.length === 0 && data === undefined) { // delete index
            modState.splice(currentStep, 1);
        } else {
            modState[currentStep] = reduceState(modState[currentStep], data, nextPath)
        }
        return modState;
    } else if (state != null && typeof state === "object"){
        if (typeof currentStep !== "number") throw new Error("state update error");
        const modState = {...state};
        if (nextPath.length === 0 && data === undefined) { // delete key
            delete modState[currentStep];
        } else {
            modState[currentStep] = reduceState(state[currentStep], data, nextPath)
        }
        return modState
    }
    throw new Error("state update error");
}


export interface ChangeRoomStateAction {
    type: "update";
    path: (number|string)[]|null
    data: any
}