import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { useDJ } from "./provider"

export function FolderBrowser() {
  const { database, tracks, libraryTab, setLibraryTab } = useDJ()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prior) => {
      const next = new Set(prior)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <nav className="folder-browser" aria-label="Music folders and playlists">
      <p className="folder-browser-label">COLLECTION</p>
      <Button
        variant="ghost"
        aria-current={libraryTab === "all" ? "page" : undefined}
        onClick={() => setLibraryTab("all")}
      >
        <Icon name="library" size={16} />
        <span>All tracks</span>
        <small>{tracks.length}</small>
      </Button>
      {(
        [
          ["local", "On this device", "folder"],
          ["favorites", "Favorites", "heart"],
          ["queue", "Automix queue", "music"],
        ] as const
      ).map(([id, label, icon]) => (
        <Button
          key={id}
          variant="ghost"
          aria-current={libraryTab === id ? "page" : undefined}
          onClick={() => setLibraryTab(id)}
        >
          <Icon name={icon} size={16} />
          <span>{label}</span>
          {id === "queue" && <small>{database.queue.length}</small>}
        </Button>
      ))}
      <p className="folder-browser-label">MUSIC FOLDERS</p>
      {!database.linkedFolders.length && (
        <p className="muted folder-empty">
          Connect your music folder to browse its albums and subfolders here.
        </p>
      )}
      {database.linkedFolders.map((folder) => {
        const collections = database.collections.filter(
          (c) => c.id === folder.id || c.id.startsWith(`${folder.id}/path/`)
        )
        const paths = collections
          .filter((c) => c.id !== folder.id)
          .map((c) =>
            decodeURIComponent(c.id.slice(`${folder.id}/path/`.length))
          )
        const renderFolder = (path: string, depth: number): React.ReactNode => {
          const id = path
            ? `${folder.id}/path/${encodeURIComponent(path)}`
            : folder.id
          const children = paths.filter(
            (candidate) =>
              candidate !== path &&
              candidate.split("/").slice(0, -1).join("/") === path
          )
          const collection = collections.find((c) => c.id === id)
          const selected = libraryTab === `collection:${id}`
          return (
            <div key={id}>
              <div
                className="folder-tree-row"
                style={{ paddingInlineStart: depth * 12 }}
              >
                {children.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${collapsed.has(id) ? "Expand" : "Collapse"} ${path || folder.name}`}
                    aria-expanded={!collapsed.has(id)}
                    onClick={() => toggle(id)}
                  >
                    <Icon
                      name={collapsed.has(id) ? "right" : "down"}
                      size={12}
                    />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-current={selected ? "page" : undefined}
                  title={path || folder.name}
                  onClick={() => setLibraryTab(`collection:${id}`)}
                >
                  <Icon name="folder" size={15} />
                  <span>{path.split("/").at(-1) || folder.name}</span>
                  <small>{collection?.trackIds.length ?? 0}</small>
                </Button>
              </div>
              {!collapsed.has(id) &&
                children.map((child) => renderFolder(child, depth + 1))}
            </div>
          )
        }
        return renderFolder("", 0)
      })}
      {database.collections.some((c) => c.kind === "playlist") && (
        <p className="folder-browser-label">PLAYLISTS</p>
      )}
      {database.collections
        .filter(
          (c) =>
            c.kind === "folder" &&
            !database.linkedFolders.some(
              (f) => c.id === f.id || c.id.startsWith(`${f.id}/path/`)
            )
        )
        .map((c) => (
          <Button
            key={c.id}
            variant="ghost"
            aria-current={
              libraryTab === `collection:${c.id}` ? "page" : undefined
            }
            onClick={() => setLibraryTab(`collection:${c.id}`)}
          >
            <Icon name="folder" size={15} />
            <span>{c.name}</span>
            <small>{c.trackIds.length}</small>
          </Button>
        ))}
      {database.collections
        .filter((c) => c.kind === "playlist")
        .map((c) => (
          <Button
            key={c.id}
            variant="ghost"
            aria-current={
              libraryTab === `collection:${c.id}` ? "page" : undefined
            }
            onClick={() => setLibraryTab(`collection:${c.id}`)}
          >
            <Icon name="music" size={15} />
            <span>{c.name}</span>
            <small>{c.trackIds.length}</small>
          </Button>
        ))}
    </nav>
  )
}
