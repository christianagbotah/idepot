<?php
echo form_open(site_url('admin/invoice_report/'),
    array('class' => 'form-horizontal form-groups-bordered', 'id' => 'invoice', 'target' => '_blank')); ?>
    <div class="form-group row">
        <div class="col-sm-8 col-md-8">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <option value="2">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4">This Week</option>
                    <option value="5">Last Week</option>
                    <option value="6">This Month</option>
                    <option value="7">Last Month</option>
                    <option value="8">This Year</option>
                    <option value="9">Last Year</option>
                    <option value="10">Custom Date</option>
                </select>
            </div>
        </div>
    </div>

    <div class="form-group row">
        <div class="col-sm-6 col-md-6">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">From</div>
                </div>
                <input type="text" name="from" id="from" readonly="readonly" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div><hr>
            <div><strong id="from_view"><?=date('l F d, Y'); ?></strong></div>
        </div>
        <div class="col-sm-6 col-md-6">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">To</div>
                </div>
                <input type="text" name="to" id="to" readonly="readonly" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div><hr>
            <div><strong id="to_view"><?=date('l F d, Y'); ?></strong></div>
        </div>
    </div>

    <div class="d-flex flex-row mt-3">
        <div style="margin-right: 10px;">
            <button type="submit" class="btn btn-info btn-lg"><strong>Load</strong></button>
        </div>
        <div>
            <a class="btn btn-danger btn-lg" data-dismiss="modal"><strong>Cancel</strong></a>
        </div>
    </div>
</form>

<script type="text/javascript">
    $(function() {
        selection_controller();
    });

    $('#search_by_periods').change(function(event) {
        selection_controller();

        let date_value = $('#search_by_periods').val();

        $.ajax({
            url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
            type: 'POST',
            dataType: 'json',
            cache: false
            //data: {param1: 'value1'},
        })
        .done(function(data) {
            //response is ready
            $('#from').val(data.from);
            $('#to').val(data.to);

            //view update
            $('#from_view').html(data.from_view);
            $('#to_view').html(data.to_view);
        });
    });

    $('#from').change(function(event) {
        /* Act on the event */
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });

    $('#to').change(function(event) {
        /* Act on the event */
        let date_val = $('#to').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#to_view').html(date.toDateString());
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        let date_val = $('#to').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#to_view').html(date.toDateString());
    });

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            $('#from').removeAttr('readonly');
            $('#to').removeAttr('readonly');
        } else {

            $('#from').attr('readonly', 'readonly');
            $('#to').attr('readonly', 'readonly');
        }
    }

    $('#invoice').submit(function(event) {
        /* Act on the event */
        window.location.reload();
    });
</script>