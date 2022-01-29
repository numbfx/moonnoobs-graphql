import {  StakeCall, UnstakeCall  } from '../generated/MoonStaking/MoonStaking'
import { handleBlock } from './utils/ProtocolMetrics'

export function handleStake(call: StakeCall): void {
    handleBlock(call.block)
}

export function handleUnstake(call: UnstakeCall): void {
    handleBlock(call.block)
}