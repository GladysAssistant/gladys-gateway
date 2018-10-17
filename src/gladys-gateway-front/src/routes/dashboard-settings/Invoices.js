const dateDisplayOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

const Invoices = ({ children, ...props }) => (
  <div class="card">
    <div>
      <div class="table-responsive">
        <table class="table table-hover table-outline table-vcenter text-nowrap card-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Link</th>
              <th>Pdf</th>
            </tr>
          </thead>
          <tbody>
            
            { props.invoices && props.invoices.map((invoice, index) => (
              <tr>
                <td>{new Date(invoice.created_at).toLocaleDateString('en-US', dateDisplayOptions)}</td>
                <td>{invoice.amount_paid/100} €</td>
                <td><a href={invoice.hosted_invoice_url} class="btn btn-primary">View in browser</a></td>
                <td><a href={invoice.invoice_pdf} class="btn btn-primary">Download</a></td>
              </tr>
            ))
            }
           
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default Invoices;