import style from './style.css';
import Step1Billing from './Step1Billing';
import Step2ConnectGladys from './Step2ConnectGladys';
import Step3LinkAccount from './Step3LinkAccount';
import Step4Success from './Step4Success';

const SetupContainer = ({ children, ...props }) => (
  <div class="page">
    <div class="page-single" style={{ marginTop: '10px' }}>
      <div class="container">
        <div class="row">
          <div class={style.colPayment + ' col mx-auto'}>
            <div class="text-center mb-6">
              <h2>Gladys Gateway</h2>
            </div>
            <div class="card">
              <div class="card-body">
                <ul class="nav nav-pills nav-fill">
                  <li class="nav-item">
                    <a class={'nav-link ' + (props.step === 1 && 'active')} href="#">
                      Billing
                    </a>
                  </li>
                  <li class="nav-item">
                    <a class={'nav-link ' + (props.step === 2 && 'active')} href="#">
                      Connect your Gladys
                    </a>
                  </li>
                  <li class="nav-item">
                    <a class={'nav-link ' + (props.step === 3 && 'active')} href="#">
                      Link your account
                    </a>
                  </li>
                  <li class="nav-item">
                    <a class={'nav-link ' + (props.step === 4 && 'active')} href="#">
                      Success!
                    </a>
                  </li>
                </ul>
              </div>
              <div class="card-body p-6">
                {/* prettier-ignore */ props.step === 1 && props.stripeLoaded && (
                  <Step1Billing
                    paymentInProgress={props.paymentInProgress}
                    savingBillingError={props.savingBillingError}
                    userCardName={props.userCardName}
                    updateUserCardName={props.updateUserCardName}
                    saveBillingInformations={props.saveBillingInformations}
                  />
                )}

                {props.step === 2 && (
                  <Step2ConnectGladys
                    latency={props.latency}
                    instanceFound={props.instanceFound}
                    instance={props.instance}
                    activateStep3={props.activateStep3}
                  />
                )}
                {props.step === 3 && (
                  <Step3LinkAccount
                    user={props.user}
                    usersInGladys={props.usersInGladys}
                    gladysUserSelected={props.gladysUserSelected}
                    updateGladysUserSelected={props.updateGladysUserSelected}
                    saveUserInInGladys={props.saveUserInInGladys}
                    userNotAcceptedLocallyError={props.userNotAcceptedLocallyError}
                    instanceFound={props.instanceFound}
                  />
                )}
                {props.step === 4 && <Step4Success goToDashboard={props.goToDashboard} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default SetupContainer;
