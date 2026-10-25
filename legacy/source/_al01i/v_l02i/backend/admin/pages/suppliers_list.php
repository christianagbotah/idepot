<div class="container-fluid">
    <div class="row">

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-info btn-lg" id="duadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/');?>', 'Add New Supplier')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-success btn-lg" id="suedit" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/edit_supplier/');?>', 'Edit Supplier')"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-danger btn-lg" id="sudelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-secondary btn-lg" id="suemail"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-info btn-lg" id="sucall"><i class="fa fa-2x fa-fw fa-phone"></i></button><br><strong class="ml-4">Call</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-warning btn-lg" id="sustatement"><i class="fa fa-2x fa-fw fa-file-text"></i></button><br><strong style="margin-left: -7px">Statement</strong></div>
            <div class="col-md-6 col-sm-6 col-lg-6"></div>

    </div>

    <hr>
    <hr>
    <div class="row">
        <table class="table table-striped table-hover table-success" width="100%" id="suppliers_list">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Account Payable</th>
                <th>Due Date</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GH BUILDERS</td>
                <td>95,000.00</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
        </table>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        $('#suppliers_list').DataTable();
    });
</script>