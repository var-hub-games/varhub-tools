export interface RoomInfo {
    roomId: string // new room id
    owned: boolean // is it your room
    handlerUrl: string
}

export interface RoomOnlineInfo extends RoomInfo {
    state: any // any json*
    users: ConnectionInfo[]
    door: DoorData|null
}

export interface ConnectionInfo {
    account: HubAccount
    resource: string;
    id: string // (userId + resource)
}

export interface HubAccount {
    id: string
    name: string
}

export interface DoorData {
    mode: DoorMode
    allowlist: string[] // users ids
    blocklist: string[] // users ids
    knock: HubAccount[]
}

export interface MessageData {
    from: string,
    message: any
}

export interface RoomStateChangeData {
    path: (string|number)[] | null,
    data: any
}

export type DoorMode = "open" | "knock" | "closed";
