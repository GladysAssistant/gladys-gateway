import style from './spinner.css';

const SignupGeneratingKeys = ({ children, ...props }) => (
  <div onSubmit={props.validateForm} className="card">
    <div className="card-body p-6">
      <div className="card-title" style={{ textAlign: 'center' }}>
        Generating your public/private keys...
      </div>
      <div class={style.spWave + ' ' + style.sp} />
      <div />
    </div>
  </div>
);

export default SignupGeneratingKeys;
