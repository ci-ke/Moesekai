import { type DataProvider } from '../data-provider/data-provider'
import { CardCalculator, type CardConfig, type CardDetail } from '../card-information/card-calculator'
import {
  DeckCalculator,
  type DeckDetail
} from '../deck-information/deck-calculator'
import { LiveType } from '../live-score/live-calculator'
import { type UserCard } from '../user-data/user-card'
import { type MusicMeta } from '../common/music-meta'
import { type RecommendDeck } from './base-deck-recommend'
import { toRecommendDeck } from './deck-result-update'
import { AreaItemService } from '../area-item-information/area-item-service'
import { EventCalculator } from '../event-point/event-calculator'
import { type EventConfig, EventType } from '../event-point/event-service'
import { EventService } from '../event-point/event-service'
import { filterCardPriority } from '../card-priority/card-priority-filter'
import { safeNumber } from '../util/number-util'

/**
 * 控分组卡推荐
 * 以特定目标活动加成（范围匹配）推荐卡组
 * 返回活动加成在 [minBonus, maxBonus] 范围内的卡组，否则返回空数组
 */
export class EventBonusDeckRecommend {
  private readonly cardCalculator: CardCalculator
  private readonly deckCalculator: DeckCalculator
  private readonly areaItemService: AreaItemService
  private readonly eventService: EventService

  public constructor(private readonly dataProvider: DataProvider) {
    this.cardCalculator = new CardCalculator(dataProvider)
    this.deckCalculator = new DeckCalculator(dataProvider)
    this.areaItemService = new AreaItemService(dataProvider)
    this.eventService = new EventService(dataProvider)
  }

  /**
   * 推荐活动加成在指定范围内的卡组（控分组卡）
   * 返回所有加成值不同的卡组（每个加成值最多一个），找不到则返回空数组
   * @param eventId 活动ID
   * @param targetBonus 目标活动加成（兼容旧接口：当 maxBonus 未指定时，作为精确目标）
   * @param liveType Live类型
   * @param config 推荐设置
   * @param specialCharacterId 指定的角色（用于世界开花活动支援卡组）
   * @param maxBonus 目标活动加成最大值（可选，指定后 targetBonus 作为最小值）
   */
  public async recommendEventBonusDeck(
    eventId: number, targetBonus: number,
    liveType: LiveType, config: EventBonusDeckRecommendConfig,
    specialCharacterId: number = 0,
    maxBonus?: number
  ): Promise<RecommendDeck[]> {
    const eventConfig = await this.eventService.getEventConfig(eventId, specialCharacterId)
    if (eventConfig.eventType === undefined) throw new Error(`Event type not found for ${eventId}`)
    const userCards = await this.dataProvider.getUserData<UserCard[]>('userCards')

    const {
      musicMeta,
      member = 5,
      cardConfig = {},
      specificBonuses,
      debugLog = (_: string) => { }
    } = config

    // 确定搜索范围
    const minB = maxBonus !== undefined ? targetBonus : targetBonus
    const maxB = maxBonus !== undefined ? maxBonus : targetBonus

    const honorBonus = await this.deckCalculator.getHonorBonusPower()
    const areaItemLevels = await this.areaItemService.getAreaItemLevels()
    let cards =
      await this.cardCalculator.batchGetCardDetail(userCards, cardConfig, eventConfig, areaItemLevels)

    // 过滤箱活的卡
    const { eventUnit, worldBloomSupportUnit } = eventConfig
    let filterUnit = eventUnit
    if (worldBloomSupportUnit !== undefined) {
      filterUnit = worldBloomSupportUnit
    }
    if (filterUnit !== undefined) {
      const originCardsLength = cards.length
      cards = cards.filter(it =>
        (it.units.length === 1 && it.units[0] === 'piapro') ||
        filterUnit === undefined || it.units.includes(filterUnit))
      debugLog(`Cards filtered with unit ${filterUnit}: ${cards.length}/${originCardsLength}`)
    }

    // 按活动加成从低到高排序，便于搜索和剪枝
    cards = cards.sort((a, b) => {
      const aBonus = a.eventBonus?.getMaxBonus(true) ?? 0
      const bBonus = b.eventBonus?.getMaxBonus(true) ?? 0
      return aBonus - bBonus
    })

    if (specificBonuses && specificBonuses.length > 0) {
      debugLog(`Searching for deck with specific bonuses: ${specificBonuses.join(', ')} in [${minB}, ${maxB}]`)
    } else {
      debugLog(`Searching for deck with event bonus in [${minB}, ${maxB}] in ${cards.length} cards`)
    }

    // 搜索匹配范围的卡组
    const results = EventBonusDeckRecommend.findBonusDeckInRange(
      cards, minB, maxB, honorBonus, member, eventConfig, debugLog, specificBonuses
    )

    if (results.length === 0) {
      debugLog('No deck found in target bonus range')
      return []
    }

    debugLog(`Found ${results.length} deck(s) with event bonus in range [${minB}, ${maxB}]`)
    return results
  }

  /**
   * 搜索活动加成在 [minBonus, maxBonus] 范围内的卡组
   * 返回多个加成值不同的卡组
   * @param cardDetails 参与计算的卡牌（按活动加成从低到高排序）
   * @param minBonus 目标活动加成最小值
   * @param maxBonus 目标活动加成最大值
   * @param honorBonus 称号加成
   * @param member 卡组人数
   * @param eventConfig 活动设置
   * @param debugLog 日志函数
   */
  private static findBonusDeckInRange(
    cardDetails: CardDetail[], minBonus: number, maxBonus: number,
    honorBonus: number, member: number, eventConfig: EventConfig,
    debugLog: (str: string) => void = (_: string) => { },
    specificBonuses?: number[]
  ): RecommendDeck[] {
    const allCards = cardDetails
    const foundBonuses = new Set<number>()
    const results: RecommendDeck[] = []
    EventBonusDeckRecommend.dfs(
      cardDetails, allCards, minBonus, maxBonus, honorBonus, member, eventConfig,
      [], 0, foundBonuses, results, debugLog, specificBonuses
    )
    // 按加成从低到高排序
    results.sort((a, b) => a.score - b.score)
    return results
  }

  /**
   * DFS搜索活动加成在 [minBonus, maxBonus] 范围内的卡组
   * 使用 startIndex 避免重复组合（标准无重复组合搜索模式）
   * @param cardDetails 可选卡牌
   * @param allCards 全部卡牌
   * @param minBonus 目标活动加成最小值
   * @param maxBonus 目标活动加成最大值
   * @param honorBonus 称号加成
   * @param member 卡组人数限制
   * @param eventConfig 活动设置
   * @param deckCards 当前已选卡牌
   * @param startIndex 从此索引开始选取卡牌（避免重复组合）
   * @param foundBonuses 已找到的加成值集合（去重）
   * @param results 结果数组
   * @param debugLog 日志函数
   */
  private static dfs(
    cardDetails: CardDetail[], allCards: CardDetail[],
    minBonus: number, maxBonus: number,
    honorBonus: number, member: number, eventConfig: EventConfig,
    deckCards: CardDetail[], startIndex: number,
    foundBonuses: Set<number>, results: RecommendDeck[],
    debugLog: (str: string) => void,
    specificBonuses?: number[]
  ): void {
    // 收集足够多不同加成值的卡组后停止搜索（限制结果数量）
    // 增加限制以尽可能多地找到不同的加成值，供规划使用
    const MAX_RESULTS = 100
    if (results.length >= MAX_RESULTS) return

    // 已经组满卡组，计算活动加成是否在范围内
    if (deckCards.length === member) {
      const deckDetail = DeckCalculator.getDeckDetailByCards(
        deckCards, allCards, honorBonus, eventConfig.cardBonusCountLimit,
        eventConfig.worldBloomDifferentAttributeBonuses
      )
      const actualBonus = safeNumber(deckDetail.eventBonus) + safeNumber(deckDetail.supportDeckBonus)

      // 检查是否在范围内
      if (actualBonus >= minBonus && actualBonus <= maxBonus) {
        // 如果指定了具体目标加成，则必须匹配其中之一
        if (specificBonuses !== undefined && specificBonuses.length > 0) {
          // 由于浮点数精度问题，使用由 epsilon 比较
          const isMatch = specificBonuses.some(b => Math.abs(b - actualBonus) < 0.001)
          if (!isMatch) return
        }

        // 如果这个加成值已有结果则跳过
        if (foundBonuses.has(actualBonus)) return
        foundBonuses.add(actualBonus)
        const ret = deckDetail as RecommendDeck
        ret.score = actualBonus
        results.push(ret)
      }
      return
    }

    // 继续选卡，从 startIndex 开始以避免重复组合
    for (let i = startIndex; i < cardDetails.length; i++) {
      if (results.length >= MAX_RESULTS) return

      const card = cardDetails[i]

      // 跳过重复角色
      if (deckCards.some(it => it.characterId === card.characterId)) {
        continue
      }

      // 剪枝：计算已选卡牌的固定加成下界，如果已经超过目标上限则跳过
      const currentCards = [...deckCards, card]
      const currentMinBonus = EventBonusDeckRecommend.estimateMinBonus(currentCards, eventConfig)
      if (currentMinBonus > maxBonus) {
        continue
      }

      EventBonusDeckRecommend.dfs(
        cardDetails, allCards, minBonus, maxBonus, honorBonus, member, eventConfig,
        currentCards, i + 1, foundBonuses, results, debugLog
      )
    }
  }

  /**
   * 估算当前已选卡牌的活动加成下界
   * 用于剪枝：如果仅固定加成就已超过目标上限，后续无论加什么卡都不可能降低
   * @param deckCards 当前已选卡牌
   * @param eventConfig 活动设置
   */
  private static estimateMinBonus(deckCards: CardDetail[], eventConfig: EventConfig): number {
    let bonus = 0
    for (const card of deckCards) {
      if (card.eventBonus === undefined) continue
      const bonusDetail = card.eventBonus.getBonus()
      // 只计算固定部分（最小的加成），不计算cardBonus和leaderBonus
      bonus += bonusDetail.fixedBonus
    }
    return bonus
  }
}

/**
 * 控分组卡推荐设置
 */
export interface EventBonusDeckRecommendConfig {
  /**
   * 歌曲信息
   */
  musicMeta: MusicMeta
  /**
   * 限制人数（2-5、默认5）
   */
  member?: number
  /**
   * 卡牌设置
   * key为各个稀有度
   */
  cardConfig?: Record<string, CardConfig>
  /**
   * 指定的目标加成列表（可选）
   * 如果指定，则只返回活动加成精确匹配这些值的卡组
   */
  specificBonuses?: number[]
  /**
   * 处理测试日志的函数
   * @param str 日志内容
   */
  debugLog?: (str: string) => void
}
