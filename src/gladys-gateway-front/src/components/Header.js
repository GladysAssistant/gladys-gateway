const Header = ({ children, ...props }) => (
  <div>
    <div class="header py-4">
      <div class="container">
        <div class="d-flex">
          <a class="header-brand" href="./index.html">
            <img src="./demo/brand/tabler.svg" class="header-brand-img" alt="tabler logo" />
          </a>
          <div class="d-flex order-lg-2 ml-auto">
            <div class="dropdown d-none d-md-flex">
              <a class="nav-link icon" data-toggle="dropdown">
                <i class="fe fe-bell" />
                <span class="nav-unread" />
              </a>
              <div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow">
                <a href="#" class="dropdown-item d-flex">
                  <span
                    class="avatar mr-3 align-self-center"
                    style="background-image: url(demo/faces/male/41.jpg)"
                  />
                  <div>
                    <strong>Nathan</strong> pushed new commit: Fix page load performance issue.
                    <div class="small text-muted">10 minutes ago</div>
                  </div>
                </a>
                <a href="#" class="dropdown-item d-flex">
                  <span
                    class="avatar mr-3 align-self-center"
                    style="background-image: url(demo/faces/female/1.jpg)"
                  />
                  <div>
                    <strong>Alice</strong> started new task: Tabler UI design.
                    <div class="small text-muted">1 hour ago</div>
                  </div>
                </a>
                <a href="#" class="dropdown-item d-flex">
                  <span
                    class="avatar mr-3 align-self-center"
                    style="background-image: url(demo/faces/female/18.jpg)"
                  />
                  <div>
                    <strong>Rose</strong> deployed new version of NodeJS REST Api V3
                    <div class="small text-muted">2 hours ago</div>
                  </div>
                </a>
                <div class="dropdown-divider" />
                <a href="#" class="dropdown-item text-center text-muted-dark">
                  Mark all as read
                </a>
              </div>
            </div>
            <div class="dropdown">
              <a href="#" class="nav-link pr-0 leading-none" data-toggle="dropdown">
                <span class="avatar" style="background-image: url(./demo/faces/female/25.jpg)" />
                <span class="ml-2 d-none d-lg-block">
                  <span class="text-default">Jane Pearson</span>
                  <small class="text-muted d-block mt-1">Administrator</small>
                </span>
              </a>
              <div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow">
                <a class="dropdown-item" href="#">
                  <i class="dropdown-icon fe fe-user" /> Profile
                </a>
                <a class="dropdown-item" href="#">
                  <i class="dropdown-icon fe fe-settings" /> Settings
                </a>
                <div class="dropdown-divider" />
                <a class="dropdown-item" href="#">
                  <i class="dropdown-icon fe fe-help-circle" /> Need help?
                </a>
                <a class="dropdown-item" href="#">
                  <i class="dropdown-icon fe fe-log-out" /> Sign out
                </a>
              </div>
            </div>
          </div>
          <a
            href="#"
            class="header-toggler d-lg-none ml-3 ml-lg-0"
            data-toggle="collapse"
            data-target="#headerMenuCollapse"
          >
            <span class="header-toggler-icon" />
          </a>
        </div>
      </div>
    </div>
    <div class="header collapse d-lg-flex p-0" id="headerMenuCollapse">
      <div class="container">
        <div class="row align-items-center">
          <div class="col-lg-3 ml-auto">
            <form class="input-icon my-3 my-lg-0">
              <input
                type="search"
                class="form-control header-search"
                placeholder="Search&hellip;"
                tabindex="1"
              />
              <div class="input-icon-addon">
                <i class="fe fe-search" />
              </div>
            </form>
          </div>
          <div class="col-lg order-lg-first">
            <ul class="nav nav-tabs border-0 flex-column flex-lg-row">
              <li class="nav-item">
                <a href="/dashboard" class="nav-link">
                  <i class="fe fe-home" /> Home
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Header;
