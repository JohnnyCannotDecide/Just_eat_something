/**
 * 备份与图片的容量上限；导出和导入共用同一套阈值，
 * 避免出现“能导出却不能导入”的备份。
 * 单位均为字节，备份总量按 UTF-8 编码后的实际字节数计算。
 */

/** 单张图片解码后的最大体积（压缩后 512×512 远小于这个值）。 */
export const IMAGE_MAX_BYTES = 1 * 1024 * 1024

/** 一份备份里全部图片解码后的总体积。base64 膨胀后仍应低于备份总上限。 */
export const IMAGES_TOTAL_MAX_BYTES = 12 * 1024 * 1024

/** 一份备份里图片的最大张数。 */
export const IMAGES_MAX_COUNT = 200

/** 备份 JSON（含 base64 图片）的 UTF-8 字节数上限。 */
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024
