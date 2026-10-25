<div class="container-fluid">
    <div class="row">

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-info btn-lg" id="billadd" onclick="toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/enter_payable/');?>', 'Record New Account Payable')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-success btn-lg" id="billedit" onclick="toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/edit_enter_payable/');?>', 'Edit Account Payable')"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-danger btn-lg" id="billdelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-secondary btn-lg" id="billpayment"><i class="fa fa-2x fa-fw fa-donate"></i></button><br><strong style="margin-left: -3px">Payment</strong></div>

    </div>

    <hr>
     <?php
       echo form_open(site_url('admin/accounts_payable_search') ,
        array('class' => 'form-horizontal form-groups-bordered','target'=>'_top')); ?>
    <div class="form-group row">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods">
                    <option value="1">All</option>
                    <option value="2">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4">This Week</option>
                    <option value="5">Last Week</option>
                    <option value="6">This Month</option>
                    <option value="7">Last Month</option>
                    <option value="8">Custom Date</option>
                </select>
            </div>
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Start</div>
                </div>
                <input type="text" name="billstart_date" id="billstart_date" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div>
        </div>
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">End</div>
                </div>
                <input type="text" name="billend_date" id="billend_date" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div>
        </div>

        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Supplier</div>
                </div>
                <select class="form-control" name="billsearch_by_supplier">
                    <option value="0">All</option>
                    <option value="1">GH BUILDERS</option>
                    <option value="2">ENI</option>
                </select>
            </div>
        </div>
<!--
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Status</div>
                </div>
                <select class="form-control" name="search_by_supplier">
                    <option value="1">All</option>
                    <option value="2">Open</option>
                    <option value="3">Received</option>
                </select>
            </div>
        </div>
                -->
    </div>
    </form>
    <hr>
    <div class="row">
        <table class="table table-striped table-hover table-success" width="100%" id="view_accounts_payable_table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>PO No.</th>
                <th>Reference</th>
                <th style="text-align: right">Amount</th>
                <th style="text-align: right">Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td></td>
                <td></td>
                <td>PURC-1001</td>
                <td></td>
                <td></td>
                <td></td>
                <td align="right"><strong></strong></td>
              </tr>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>7 Bills</strong></div>
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total: GHS 500,000.00</strong></div>

    </div>
</div>

<script type="text/javascript">
    $(function() {
        $('#view_accounts_payable_table').DataTable();
    });

    function toBackground() {
        $('.btn').attr('data-dismiss', 'modal');
    }
</script>
