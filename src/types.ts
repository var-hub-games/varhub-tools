export interface RoomInfo {
    roomId: string // new room id
    owned: boolean // is it your room
    handlerUrl: string
}

export interface RoomOnlineInfo extends RoomInfo {
    state: any // any json*
    users: ConnectionInfo[]
    door: Door|null
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

export interface Door {
    mode: DoorMode
    allowlist: string[] // users ids
    blocklist: string[] // users ids
}

export interface MessageData {
    from: string,
    message: any
}

export type DoorMode = "open" | "knock" | "closed";