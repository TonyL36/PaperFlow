import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";

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
  return (
    <div className="pf-topnav">
      <div className="pf-topnav__inner">
        <Link to="/posts" className="pf-brand">
          PaperFlow
        </Link>
        <NavLink to="/posts" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          <NavTile icon="📰" label="Feed" />
        </NavLink>
        <NavLink to="/viz" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          <NavTile icon="🧭" label="Viz" />
        </NavLink>
        <NavLink to="/pathfinder" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          <NavTile icon="🗺️" label="Pathfinder" />
        </NavLink>
        {auth.state.status === "authenticated" ? (
          <>
            <NavLink
              to="/favorites"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="⭐" label="Favorites" />
            </NavLink>
            <NavLink
              to="/footprints"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="👣" label="Footprints" />
            </NavLink>
            <NavLink
              to="/notifications"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="🔔" label="Messages" />
            </NavLink>
          </>
        ) : null}
        {isAdmin ? (
          <>
            <NavLink
              to="/admin/users"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="🧑‍⚖️" label="Users" />
            </NavLink>
            <NavLink
              to="/admin/comments"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="🛡️" label="Comment Review" />
            </NavLink>
            <NavLink
              to="/admin/posts/moderation"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="🧩" label="Post Policy" />
            </NavLink>
            <NavLink
              to="/admin/settings/mail"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              <NavTile icon="✉️" label="Mail" />
            </NavLink>
          </>
        ) : null}
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
          <NavLink to="/login" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
            <NavTile icon="🔐" label="Sign in" />
          </NavLink>
        )}
      </div>
    </div>
  );
}
