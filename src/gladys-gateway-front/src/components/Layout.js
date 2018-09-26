import Header from './Header';
import Footer from './Footer';

const Layout = ({ children, ...props }) => (
  <div class="page">
    <div class="page-main">
      <Header />
      <div class="my-3 my-md-5">{children}</div>
      <Footer />
    </div>
  </div>
);

export default Layout;
