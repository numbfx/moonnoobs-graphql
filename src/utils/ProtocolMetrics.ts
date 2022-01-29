import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import { MoonERC20Token } from "../../generated/MoonStaking/MoonERC20Token";
import { sMoon } from "../../generated/MoonStaking/sMoon";
import { MOONCirculatingSupplyContract } from "../../generated/MoonStaking/MOONCirculatingSupplyContract";
import { ERC20 } from "../../generated/MoonStaking/ERC20";
import { UniswapV2Pair } from "../../generated/MoonStaking/UniswapV2Pair";
import { MoonStaking } from "../../generated/MoonStaking/MoonStaking";
import { ethereum } from "@graphprotocol/graph-ts";

import { ProtocolMetric, LastBlock } from "../../generated/schema";
import {
  CIRCULATING_SUPPLY_CONTRACT,
  CIRCULATING_SUPPLY_CONTRACT_BLOCK,
  MOON_ERC20_CONTRACT,
  SMOON_ERC20_CONTRACT,
  STAKING_CONTRACT,
  TREASURY_ADDRESS,
  TRISOLARIS_MOONUSDC_PAIR,
  TRISOLARIS_MOONUSDC_PAIR_BLOCK,
  USDC_ERC20_CONTRACT,
  WNEAR_ERC20_CONTRACT,
} from "./Constants";
import { toDecimal } from "./Decimals";
import {
  getMOONUSDRate,
  getDiscountedPairUSD,
  getPairUSD,
  getWNEARUSDRate,
} from "./Price";

export function loadOrCreateProtocolMetric(
  blockNumber: BigInt,
  timestamp: BigInt
): ProtocolMetric {
  let id = blockNumber.minus(blockNumber.mod(BigInt.fromString("16000")));

  let protocolMetric = ProtocolMetric.load(id.toString());
  if (protocolMetric == null) {
    protocolMetric = new ProtocolMetric(id.toString());
    protocolMetric.timestamp = timestamp;
    protocolMetric.moonCirculatingSupply = BigDecimal.fromString("0");
    protocolMetric.sMoonCirculatingSupply = BigDecimal.fromString("0");
    protocolMetric.totalSupply = BigDecimal.fromString("0");
    protocolMetric.moonPrice = BigDecimal.fromString("0");
    protocolMetric.marketCap = BigDecimal.fromString("0");
    protocolMetric.totalValueLocked = BigDecimal.fromString("0");
    protocolMetric.treasuryRiskFreeValue = BigDecimal.fromString("0");
    protocolMetric.treasuryMarketValue = BigDecimal.fromString("0");
    protocolMetric.treasuryInvestments = BigDecimal.fromString("0");
    protocolMetric.nextEpochRebase = BigDecimal.fromString("0");
    protocolMetric.nextDistributedMoon = BigDecimal.fromString("0");
    protocolMetric.currentAPY = BigDecimal.fromString("0");
    protocolMetric.treasuryUsdcRiskFreeValue = BigDecimal.fromString("0");
    protocolMetric.treasuryUsdcMarketValue = BigDecimal.fromString("0");
    protocolMetric.treasuryWNEARRiskFreeValue = BigDecimal.fromString("0");
    protocolMetric.treasuryWNEARMarketValue = BigDecimal.fromString("0");

    protocolMetric.save();
  }
  return protocolMetric as ProtocolMetric;
}

function getTotalSupply(): BigDecimal {
  let moon_contract = MoonERC20Token.bind(
    Address.fromString(MOON_ERC20_CONTRACT)
  );
  let total_supply = toDecimal(moon_contract.totalSupply(), 9);
  log.debug("Total Supply {}", [total_supply.toString()]);
  return total_supply;
}

function getCirculatingSupply(
  blockNumber: BigInt,
  total_supply: BigDecimal
): BigDecimal {
  let circ_supply: BigDecimal;
  if (blockNumber.gt(BigInt.fromString(CIRCULATING_SUPPLY_CONTRACT_BLOCK))) {
    let circulatingsupply_contract = MOONCirculatingSupplyContract.bind(
      Address.fromString(CIRCULATING_SUPPLY_CONTRACT)
    );
    circ_supply = toDecimal(
      circulatingsupply_contract.MOONCirculatingSupply(),
      9
    );
  } else {
    circ_supply = total_supply;
  }
  log.debug("Circulating Supply {}", [circ_supply.toString()]);
  return circ_supply;
}

function getSmoonSupply(blockNumber: BigInt): BigDecimal {
  let smoon_contract = sMoon.bind(Address.fromString(SMOON_ERC20_CONTRACT));
  let smoon_supply = toDecimal(smoon_contract.circulatingSupply(), 9);
  log.debug("sMOON Supply {}", [smoon_supply.toString()]);
  return smoon_supply;
}

function getMOONUSDCReserves(pair: UniswapV2Pair): BigDecimal[] {
  let reserves = pair.getReserves();
  let usdcReserves = toDecimal(reserves.value0, 6);
  let moonReserves = toDecimal(reserves.value1, 9);
  return [moonReserves, usdcReserves];
}

function getMV_RFV(blockNumber: BigInt): BigDecimal[] {
  const rfvRatio = BigDecimal.fromString("0.5");
  let usdcERC20 = ERC20.bind(Address.fromString(USDC_ERC20_CONTRACT));
  let wnearERC20 = ERC20.bind(Address.fromString(WNEAR_ERC20_CONTRACT));
  let moonusdcPair = UniswapV2Pair.bind(
    Address.fromString(TRISOLARIS_MOONUSDC_PAIR)
  );
  let usdcBalance = usdcERC20.balanceOf(Address.fromString(TREASURY_ADDRESS));

  // Calculate wnear value
  let wnearBalance = wnearERC20.balanceOf(Address.fromString(TREASURY_ADDRESS));
  let wnearValue = toDecimal(wnearBalance, 18).times(getWNEARUSDRate());
  let wnearRFV = wnearValue.times(rfvRatio);

  let moonusdRate = getMOONUSDRate();

  //MOONUSDC
  let moonusdcValue = BigDecimal.fromString("0");
  let moonusdcRFV = BigDecimal.fromString("0");
  let moonusdcPOL = BigDecimal.fromString("0");
  if (blockNumber.gt(BigInt.fromString(TRISOLARIS_MOONUSDC_PAIR_BLOCK))) {
    let moonusdcBalance = moonusdcPair.balanceOf(
      Address.fromString(TREASURY_ADDRESS)
    );
    let moonusdcTotalLP = toDecimal(moonusdcPair.totalSupply(), 18);
    let moonusdcReserves = getMOONUSDCReserves(moonusdcPair);
    moonusdcPOL = toDecimal(moonusdcBalance, 18)
      .div(moonusdcTotalLP)
      .times(BigDecimal.fromString("100"));
    moonusdcValue = getPairUSD(
      moonusdcBalance,
      moonusdcTotalLP,
      moonusdcReserves,
      moonusdRate,
      BigDecimal.fromString("1")
    );
    moonusdcRFV = getDiscountedPairUSD(
      moonusdcBalance,
      moonusdcTotalLP,
      moonusdcReserves,
      BigDecimal.fromString("1")
    );
  }

  let stableValueDecimal = toDecimal(usdcBalance, 6);

  let lpValue = moonusdcValue;
  let rfvLpValue = moonusdcRFV;

  let mv = stableValueDecimal.plus(lpValue).plus(wnearValue);
  let rfv = stableValueDecimal.plus(rfvLpValue).plus(wnearRFV);

  log.debug("Treasury Market Value {}", [mv.toString()]);
  log.debug("Treasury RFV {}", [rfv.toString()]);
  log.debug("Treasury USDC value {}", [toDecimal(usdcBalance, 6).toString()]);
  log.debug("Treasury WNEAR value {}", [wnearValue.toString()]);
  log.debug("Treasury WNEAR RFV {}", [wnearRFV.toString()]);
  log.debug("Treasury MOON-USDC RFV {}", [moonusdcRFV.toString()]);

  return [
    mv,
    rfv,
    // treasuryUsdcRiskFreeValue = USDC RFV + USDC
    moonusdcRFV.plus(toDecimal(usdcBalance, 6)),
    // treasuryUsdcMarketValue = USDC LP + USDC
    moonusdcValue.plus(toDecimal(usdcBalance, 6)),
    // treasuryFraxMarketValue = Frax LP + FRAX
    // POL
    moonusdcPOL,
    // Investing
    wnearRFV,
    wnearValue,
  ];
}

function getNextMOONRebase(blockNumber: BigInt): BigDecimal {
  let staking_contract = MoonStaking.bind(
    Address.fromString(STAKING_CONTRACT)
  );
  let distribution = toDecimal(staking_contract.epoch().value3, 9);
  log.debug("next_distribution {}", [distribution.toString()]);
  let next_distribution = distribution;
  log.debug("next_distribution total {}", [next_distribution.toString()]);

  return next_distribution;
}

function getAPY_Rebase(
  sMOON: BigDecimal,
  distributedMOON: BigDecimal
): BigDecimal[] {
  let nextEpochRebase = sMOON.gt(BigDecimal.fromString("0"))
    ? distributedMOON.div(sMOON).times(BigDecimal.fromString("100"))
    : BigDecimal.fromString("0");

  let nextEpochRebase_number = parseFloat(nextEpochRebase.toString());
  let currentAPY =
    Math.pow(Math.min(90, nextEpochRebase_number) / 100 + 1, 365 * 3 - 1) * 100;

  let currentAPYdecimal = BigDecimal.fromString(currentAPY.toString());

  log.debug("next_rebase {}", [nextEpochRebase.toString()]);
  log.debug("current_apy total {}", [currentAPYdecimal.toString()]);

  return [currentAPYdecimal, nextEpochRebase];
}

function getRunway(
  sMoon: BigDecimal,
  rfv: BigDecimal,
  rebase: BigDecimal
): BigDecimal {
  let runwayCurrent = BigDecimal.fromString("0");

  if (
    sMoon.gt(BigDecimal.fromString("0")) &&
    rfv.gt(BigDecimal.fromString("0")) &&
    rebase.gt(BigDecimal.fromString("0"))
  ) {
    let treasury_runway = parseFloat(rfv.div(sMoon).toString());

    let nextEpochRebase_number = parseFloat(rebase.toString()) / 100;
    let runwayCurrent_num =
      Math.log(treasury_runway) / Math.log(1 + nextEpochRebase_number) / 3;

    runwayCurrent = BigDecimal.fromString(runwayCurrent_num.toString());
  }

  return runwayCurrent;
}

export function updateProtocolMetrics(
  blockNumber: BigInt,
  timestamp: BigInt
): void {
  let pm = loadOrCreateProtocolMetric(blockNumber, timestamp);

  //Total Supply
  pm.totalSupply = getTotalSupply();

  //Circ Supply
  pm.moonCirculatingSupply = getCirculatingSupply(blockNumber, pm.totalSupply);

  //sMoon Supply
  pm.sMoonCirculatingSupply = getSmoonSupply(blockNumber);

  //MOON Price
  pm.moonPrice = getMOONUSDRate();

  //MOON Market Cap
  pm.marketCap = pm.moonCirculatingSupply.times(pm.moonPrice);

  //Total Value Locked
  pm.totalValueLocked = pm.sMoonCirculatingSupply.times(pm.moonPrice);

  //Treasury RFV and MV
  let mv_rfv = getMV_RFV(blockNumber);
  pm.treasuryMarketValue = mv_rfv[0];
  pm.treasuryRiskFreeValue = mv_rfv[1];
  pm.treasuryUsdcRiskFreeValue = mv_rfv[2];
  pm.treasuryUsdcMarketValue = mv_rfv[3];
  pm.treasuryMoonUsdcPOL = mv_rfv[4];
  pm.treasuryInvestments = mv_rfv[5];
  pm.treasuryWNEARRiskFreeValue = mv_rfv[6];
  pm.treasuryWNEARMarketValue = mv_rfv[7];

  // Rebase rewards, APY, rebase
  pm.nextDistributedMoon = getNextMOONRebase(blockNumber);
  let apy_rebase = getAPY_Rebase(
    pm.sMoonCirculatingSupply,
    pm.nextDistributedMoon
  );
  pm.currentAPY = apy_rebase[0];
  pm.nextEpochRebase = apy_rebase[1];

  //Runway
  pm.runwayCurrent = getRunway(
    pm.sMoonCirculatingSupply,
    pm.treasuryRiskFreeValue,
    pm.nextEpochRebase
  );

  pm.save();
}

export function handleBlock(block: ethereum.Block): void {
  let lastBlock = LastBlock.load("0");
  if (
    lastBlock == null ||
    block.number.minus(lastBlock.number).gt(BigInt.fromString("300"))
  ) {
    lastBlock = new LastBlock("0");
    lastBlock.number = block.number;
    lastBlock.timestamp = block.timestamp;
    lastBlock.save();
    updateProtocolMetrics(block.number, block.timestamp);
  }
}
