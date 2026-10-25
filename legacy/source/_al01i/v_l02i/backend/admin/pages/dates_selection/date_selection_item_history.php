<style type="text/css">
    .btn {
        border-radius: 8px;
        height: 30px;
    }
    .select2-selection__choice {
        font-size: 11px !important;
    }
</style>

<?php

    echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

    $item_id = $param2;

    //select the purchase dates
    $this->db->select('date_timestamp');
    $this->db->from('purchase_order');
    $this->db->distinct();
    $this->db->order_by('date_timestamp', 'asc');
    $this->db->where('item_id', $item_id);
    $item_purchase_dates_array = $this->db->get()->result_array();

    ///get current user's name
    $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

    echo form_open(site_url('admin/loadItemHistory'),
    array('class' => 'form-horizontal form-groups-bordered', 'id' => 'itemHistory', 'target' => '_blank')); ?>

    <div class="form-group row">
        <div class="col-sm-7 col-md-7">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Start Date:</div>
                </div>
                    <select class="form-control select2" name="from" id="from">
                        <?php
                        foreach($item_purchase_dates_array as $date):?>
                            <option value="<?=date('d-m-Y', $date['date_timestamp']);?>"><?=date('d-m-Y', $date['date_timestamp']);?></option>
                        <?php
                        endforeach;
                        ?>
                    </select>
            </div><hr>
            
        </div>

        <div class="col-sm-5 col-md-5">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">End Date:</div>
                </div>
                <input type="text" name="to" id="to" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div><hr>
            
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
       // selection_controller();
    });


    $('#from').change(function(event) {
        /* Act on the event */
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').val(date.toDateString());
    });

    $('#from').keyup(function(event) {

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
        $('#to_view').val(date.toDateString());
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        let date_val = $('#to').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#to_view').val(date.toDateString());
    });

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            //$('#from').removeAttr('readonly');
            $('#to').removeAttr('readonly');
        } else {

            //$('#from').attr('readonly', 'readonly');
            $('#to').attr('readonly', 'readonly');
        }
    }

    $('#itemHistory').submit(function(event) {
        event.preventDefault();

        let first_date = $('#from').val();
        let second_date = $('#to').val();

        loadHistory(first_date, second_date); //a call to the function

       //$('.close').click();
    });
</script>