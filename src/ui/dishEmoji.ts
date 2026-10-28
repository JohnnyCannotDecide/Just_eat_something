/**
 * 菜品图的临时占位。数据层没有 emoji 字段，真实图片就绪后
 * 只需要替换 UI 里的菜品图组件，不影响 dishes.json。
 */
export const DISH_EMOJI_FALLBACK = '🍽️'

const DISH_EMOJI: Readonly<Record<string, string>> = {
  white_rice: '🍚',
  steamed_sweet_potato: '🍠',
  boiled_egg: '🥚',
  oatmeal_milk: '🥣',
  whole_wheat_toast: '🍞',
  steamed_corn: '🌽',
  plain_noodles: '🍜',
  rice_porridge: '🥣',
  steamed_bun: '🥯',
  steamed_pumpkin: '🎃',
  banana: '🍌',
  apple: '🍎',
  plain_yogurt: '🥛',
  soy_milk: '🥛',
  cucumber_salad: '🥒',
  steamed_yam: '🍠',
  tomato_egg: '🍅',
  chicken_salad: '🥗',
  mushroom_cabbage: '🍄',
  shrimp_steamed_egg: '🍤',
  beef_veg_rice: '🍛',
  salmon_riceball: '🍙',
  tofu_veg_pot: '🍲',
  chicken_porridge: '🥣',
  banana_oat_cup: '🥣',
  avocado_toast: '🥑',
  corn_chicken: '🌽',
  enoki_beef_roll: '🍄',
  spinach_egg_soup: '🥬',
  teriyaki_chicken_rice: '🍗',
  tomato_brisket_noodles: '🍜',
  salmon_avocado_rice: '🍣',
  shrimp_egg_rice: '🍤',
  pan_fried_cod: '🐟',
  mapo_tofu_rice: '🍲',
  beef_pepper_brown_rice: '🍛',
  pumpkin_chicken_rice: '🎃',
  cheese_burger: '🍔',
  choco_icecream: '🍦',
  fried_chicken_platter: '🍗',
  youtiao: '🥖',
  century_egg_pork_porridge: '🥣',
  egg_pancake: '🥞',
  xiaolongbao: '🥟',
  steamed_dumplings: '🥟',
  tofu_pudding: '🍲',
  wonton_soup: '🥟',
  milk: '🥛',
  tea_egg: '🥚',
  fruit_yogurt_bowl: '🍓',
  steamed_taro: '🍠',
  egg_fried_rice: '🍚',
  braised_beef_noodles: '🍜',
  hot_sour_noodles: '🍜',
  kung_pao_chicken: '🍗',
  sweet_sour_pork: '🍖',
  steamed_sea_bass: '🐟',
  garlic_greens: '🥬',
  winter_melon_ribs_soup: '🍲',
  tomato_egg_soup: '🍅',
}

export function getDishEmoji(dishId: string): string {
  return DISH_EMOJI[dishId] ?? DISH_EMOJI_FALLBACK
}

/** 菜品图为空或只有空白时返回 null，由 emoji 兜底。 */
export function getDishImageUrl(
  image?: string | null,
): string | null {
  const trimmed = image?.trim()
  return trimmed ? trimmed : null
}
