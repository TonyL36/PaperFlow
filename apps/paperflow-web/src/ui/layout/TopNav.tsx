import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";

type TopNavLayoutMode = "full" | "compact" | "collapsed";

type TopNavItem = {
  to: string;
  icon: string;
  label: string;
};

const PRIMARY_LINKS: TopNavItem[] = [
  { to: "/posts", icon: "📰", label: "Feed" },
  { to: "/viz", icon: "🧭", label: "Viz" },
  { to: "/pathfinder", icon: "🗺️", label: "Pathfinder" },
];

const AUTH_SECONDARY_LINKS: TopNavItem[] = [
  { to: "/favorites", icon: "⭐", label: "Favorites" },
  { to: "/footprints", icon: "👣", label: "Footprints" },
  { to: "/notifications", icon: "🔔", label: "Messages" },
];

const PINNED_SECONDARY_LINKS: TopNavItem[] = [
  { to: "/favorites", icon: "⭐", label: "Favorites" },
  { to: "/notifications", icon: "🔔", label: "Messages" },
];

const ADMIN_SECONDARY_LINKS: TopNavItem[] = [
  { to: "/admin/users", icon: "🧑‍⚖️", label: "Users" },
  { to: "/admin/comments", icon: "🛡️", label: "Comment Review" },
  { to: "/admin/posts/moderation", icon: "🧩", label: "Post Policy" },
  { to: "/admin/settings/mail", icon: "✉️", label: "Mail" },
];

function resolveTopNavLayoutMode(width: number): TopNavLayoutMode {
  if (width < 1240) {
    return "collapsed";
  }
  if (width < 1440) {
    return "compact";
  }
  return "full";
}

function navClassName({ isActive }: { isActive: boolean }) {
  return ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ");
}

function NavTile({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="pf-navtile">
      <span className="pf-navtile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="pf-navtile__label">{label}</span>
    </span>
  );
}

export function TopNav() {
  const auth = useAuth();
  const isAdmin = auth.state.status === "authenticated" ? auth.state.roles.includes("ADMIN") : false;
  const [layoutMode, setLayoutMode] = useState<TopNavLayoutMode>(() => {
    if (typeof window === "undefined") {
      return "full";
    }
    return resolveTopNavLayoutMode(window.innerWidth);
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateLayoutMode = () => {
      setLayoutMode(resolveTopNavLayoutMode(window.innerWidth));
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    return () => {
      window.removeEventListener("resize", updateLayoutMode);
    };
  }, []);

  const { commonInlineItems, commonMoreItems, adminMoreItems } = useMemo(() => {
    const commonItems = auth.state.status === "authenticated" ? AUTH_SECONDARY_LINKS : [];
    const adminItems = isAdmin ? ADMIN_SECONDARY_LINKS : [];
    const commonInlineItems =
      layoutMode === "full" ? commonItems : commonItems.filter((item) => PINNED_SECONDARY_LINKS.some((pinned) => pinned.to === item.to));
    const overflowSecondaryLinks = AUTH_SECONDARY_LINKS.filter((item) => !PINNED_SECONDARY_LINKS.some((pinned) => pinned.to === item.to));
    const commonMoreItems = layoutMode === "full" ? [] : commonItems.filter((item) => overflowSecondaryLinks.some((overflowItem) => overflowItem.to === item.to));
    return { commonInlineItems, commonMoreItems, adminMoreItems: layoutMode === "full" ? [] : adminItems };
  }, [auth.state.status, isAdmin, layoutMode]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const inlineSecondaryLinks = layoutMode === "full" ? [...commonInlineItems, ...ADMIN_SECONDARY_LINKS.filter(() => isAdmin)] : commonInlineItems;
  const shouldShowMoreMenu = commonMoreItems.length > 0 || adminMoreItems.length > 0;

  useEffect(() => {
    if (!shouldShowMoreMenu && menuOpen) {
      setMenuOpen(false);
    }
  }, [menuOpen, shouldShowMoreMenu]);

  const renderMenuLink = (item: TopNavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={navClassName}
      onClick={() => {
        setMenuOpen(false);
      }}
    >
      <NavTile icon={item.icon} label={item.label} />
    </NavLink>
  );

  return (
    <div className={`pf-topnav pf-topnav--${layoutMode}`}>
      <div className="pf-topnav__inner">
        <Link to="/posts" className="pf-brand">
          PaperFlow
        </Link>
        <div className="pf-topnav__primary">
          {PRIMARY_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClassName}>
              <NavTile icon={item.icon} label={item.label} />
            </NavLink>
          ))}
        </div>
        <div className="pf-topnav__secondary">
          {inlineSecondaryLinks.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClassName}>
              <NavTile icon={item.icon} label={item.label} />
            </NavLink>
          ))}
          {shouldShowMoreMenu ? (
            <div className="pf-topnav__more">
              <button
                type="button"
                className="pf-topnav__more-trigger"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => {
                  setMenuOpen((value) => !value);
                }}
              >
                <NavTile icon="⋯" label="More" />
              </button>
              {menuOpen ? (
                <div ref={menuRef} className="pf-topnav__more-menu">
                  {commonMoreItems.length ? (
                    <div className="pf-topnav__more-group">
                      <div className="pf-topnav__more-title">Common</div>
                      {commonMoreItems.map(renderMenuLink)}
                    </div>
                  ) : null}
                  {adminMoreItems.length ? (
                    <div className="pf-topnav__more-group">
                      <div className="pf-topnav__more-title">Admin</div>
                      {adminMoreItems.map(renderMenuLink)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="pf-navspacer" />
        {auth.state.status === "authenticated" ? (
          <div className="pf-row">
            <Link to="/me" className="pf-nav-profile">
              {auth.state.avatarUrl ? <img src={auth.state.avatarUrl} alt="avatar" className="pf-avatar" /> : <div className="pf-avatar">{auth.state.displayName.slice(0, 1) || "U"}</div>}
              <span className="pf-muted">{auth.state.displayName}</span>
            </Link>
            <Button
              onClick={() => {
                void auth.logout();
              }}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <NavLink to="/login" className={navClassName}>
            <NavTile icon="🔐" label="Sign in" />
          </NavLink>
        )}
      </div>
    </div>
  );
}
