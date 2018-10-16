import { Link } from 'preact-router/match';

const Header = ({ children, ...props }) => (
  <div>
    <div class="header py-4">
      <div class="container">
        <div class="d-flex">
          <a class="header-brand" href="/dashboard">
            {false && (
              <img src="./demo/brand/tabler.svg" class="header-brand-img" alt="tabler logo" />
            )}
            <span class="header-brand-img">Gladys Gateway</span>
          </a>
          <div class="d-flex order-lg-2 ml-auto">
            <div class={'dropdown' + (props.showDropDown && ' show')}>
              <a
                onClick={props.toggleDropDown}
                class="nav-link pr-0 leading-none"
                data-toggle="dropdown"
              >
                <span
                  class="avatar"
                  style={
                    'background-image: url(' +
                    ('/assets/images/undraw_profile_pic.svg' || props.user.profile_url) +
                    ')'
                  }
                />
                <span class="ml-2 d-none d-lg-block">
                  <span class="text-default">{props.user.name}</span>
                  <small class="text-muted d-block mt-1">Administrator</small>
                </span>
              </a>
              <div
                class={
                  'dropdown-menu dropdown-menu-right dropdown-menu-arrow' +
                  (props.showDropDown && ' show')
                }
              >
                <a class="dropdown-item" href="/dashboard/profile">
                  <i class="dropdown-icon fe fe-user" /> Profile
                </a>
                <a class="dropdown-item" href="/dashboard/settings">
                  <i class="dropdown-icon fe fe-settings" /> Settings
                </a>
                <div class="dropdown-divider" />
                <a class="dropdown-item" href="/dashboard/help">
                  <i class="dropdown-icon fe fe-help-circle" /> Need help?
                </a>
                <a class="dropdown-item" href="" onClick={props.logout}>
                  <i class="dropdown-icon fe fe-log-out" /> Sign out
                </a>
              </div>
            </div>
          </div>
          <a
            class="header-toggler d-lg-none ml-3 ml-lg-0"
            data-toggle="collapse"
            data-target="#headerMenuCollapse"
            onClick={props.toggleCollapsedMenu}
          >
            <span class="header-toggler-icon" />
          </a>
        </div>
      </div>
    </div>
    <div
      class={'header collapse d-lg-flex p-0 ' + (props.showCollapsedMenu && ' show')}
      id="headerMenuCollapse"
    >
      <div class="container">
        <div class="row align-items-center">
          <div class="col-lg order-lg-first">
            <ul class="nav nav-tabs border-0 flex-column flex-lg-row">
              <li class="nav-item">
                <Link activeClassName="active" href="/dashboard" class="nav-link">
                  <i class="fe fe-home" /> Home
                </Link>
              </li>
              <li class="nav-item">
                <Link activeClassName="active" href="/dashboard/instance" class="nav-link">
                  <i class="fe fe-server" /> Instance
                </Link>
              </li>
              <li class="nav-item">
                <Link activeClassName="active" href="/dashboard/users" class="nav-link">
                  <i class="fe fe-user" /> Users
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Header;
