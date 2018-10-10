
const EmptyState = ({ children, ...props }) => (
  <div style={{ width: '400px',  marginLeft: 'auto', marginRight: 'auto', marginTop: '100px', textAlign: 'center' }}>
    <img src="/assets/images/undraw_personalization.svg" style={{ width: '200px', height: '200px', marginLeft: 'auto', marginRight: 'auto', display: 'block' }}  />
    <p>Looks you don't have any devices in your house!
      <br /> Read more <a href="">here</a> how to configure your house.
    </p>
  </div>
);

export default EmptyState;