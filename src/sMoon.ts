import { RebaseCall } from '../generated/sMoon/sMoon'
import { MoonERC20Token } from '../generated/sMoon/MoonERC20Token'
import { Rebase } from '../generated/schema'
import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import {MOON_ERC20_CONTRACT, STAKING_CONTRACT} from './utils/Constants'
import { toDecimal } from './utils/Decimals'
import {getMOONUSDRate} from './utils/Price';

export function rebaseFunction(call: RebaseCall): void {
    let rebaseId = call.transaction.hash.toHex()
    var rebase = Rebase.load(rebaseId)
    log.debug("Rebase event on TX {} with amount {}", [rebaseId, toDecimal(call.inputs.profit_, 9).toString()])

    if (rebase == null && call.inputs.profit_.gt(BigInt.fromI32(0))) {
        let hec_contract = MoonERC20Token.bind(Address.fromString(MOON_ERC20_CONTRACT))

        rebase = new Rebase(rebaseId)
        rebase.amount = toDecimal(call.inputs.profit_, 9)
        rebase.stakedMoons = toDecimal(hec_contract.balanceOf(Address.fromString(STAKING_CONTRACT)), 9)
        rebase.contract = STAKING_CONTRACT
        rebase.percentage = rebase.amount.div(rebase.stakedMoons)
        rebase.transaction = rebaseId
        rebase.timestamp = call.block.timestamp
        rebase.value = rebase.amount.times(getMOONUSDRate())
        rebase.save()
    }
}