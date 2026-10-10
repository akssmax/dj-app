import { HugeiconsIcon } from "@hugeicons/react"
import {
  SidebarLeftIcon,
  PlayIcon,
  PauseIcon,
  HeadphonesIcon,
  Settings01Icon,
  Search01Icon,
  Upload01Icon,
  UsbIcon,
  RepeatIcon,
  ShuffleIcon,
  RecordIcon,
  KeyboardIcon,
  MusicNote01Icon,
  LibraryIcon,
  StopIcon,
  InformationCircleIcon,
  MoreHorizontalIcon,
  VolumeHighIcon,
  CheckmarkCircle01Icon,
  Link01Icon,
  Cancel01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Add01Icon,
  FavouriteIcon,
  StarIcon,
  FolderAudioIcon,
  AiSparklesIcon,
  Activity01Icon,
  BookOpen01Icon,
  Download01Icon,
  Tick02Icon,
  MaximizeScreenIcon,
  MinimizeScreenIcon,
} from "@hugeicons/core-free-icons"

export const icons = {
  sidebar: SidebarLeftIcon,
  play: PlayIcon,
  pause: PauseIcon,
  headphones: HeadphonesIcon,
  settings: Settings01Icon,
  search: Search01Icon,
  upload: Upload01Icon,
  usb: UsbIcon,
  loop: RepeatIcon,
  shuffle: ShuffleIcon,
  record: RecordIcon,
  keyboard: KeyboardIcon,
  music: MusicNote01Icon,
  library: LibraryIcon,
  stop: StopIcon,
  info: InformationCircleIcon,
  more: MoreHorizontalIcon,
  volume: VolumeHighIcon,
  check: CheckmarkCircle01Icon,
  link: Link01Icon,
  close: Cancel01Icon,
  right: ArrowRight01Icon,
  down: ArrowDown01Icon,
  left: ArrowLeft01Icon,
  add: Add01Icon,
  heart: FavouriteIcon,
  star: StarIcon,
  folder: FolderAudioIcon,
  sparkles: AiSparklesIcon,
  activity: Activity01Icon,
  book: BookOpen01Icon,
  download: Download01Icon,
  tick: Tick02Icon,
  maximize: MaximizeScreenIcon,
  minimize: MinimizeScreenIcon,
}
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: keyof typeof icons
  size?: number
  className?: string
}) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      strokeWidth={1.6}
      className={className}
    />
  )
}
