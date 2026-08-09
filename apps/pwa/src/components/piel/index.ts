/**
 * Primitivos de la NUEVA PIEL (estilo Apple).
 * Normas: docs/NUEVA_PIEL_APPLE_HIG.md · Skill: /nueva-piel-apple
 *
 * Toda UI nueva se compone DESDE acá. Si algo no se puede armar con estos
 * primitivos, la respuesta no es un componente a medida: es agregar (o
 * extender) un primitivo, para que el siguiente lo herede.
 *
 * Ojo: coexisten con `components/ui/*` (shadcn, la piel vieja) mientras dura la
 * migración. Se importan por ruta explícita para que nunca haya duda de cuál es:
 *   import { Button, Pill } from '@/components/piel'
 */
export { Button, buttonVariants, type PielButtonProps } from './Button'
export { Pill, type PillProps, type PillTone } from './Pill'
export { Tag, tagToneClasses, type TagProps, type TagTone } from './Tag'
export {
  ListGroup,
  ListCell,
  CellIcon,
  type ListGroupProps,
  type ListCellProps,
} from './GroupedList'
export { Sheet, type SheetProps } from './Sheet'
export { StatRing, type StatRingProps } from './StatRing'
export { TabBar, type TabBarProps, type TabItem } from './TabBar'
