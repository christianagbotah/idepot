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

///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

echo form_open(site_url('admin/inventory_report'),
    array('class' => 'form-horizontal form-groups-bordered', 'id' => 'inventory', 'target' => '_blank')); ?>
    <div class="form-group row">
        <div class="col-sm-6 col-md-6">
                <label class="form-label col-sm-12 col-md-12 bg-secondary rounded-lg text-light">Category</label>

                <select class="form-control select2 col-sm-12 col-md-12" multiple="" required name="search_by_category[]" id="search_by_category">
                    <option value="">All</option>
                    <?php

                    $category_array = $this->db->get('item_main_category')->result_array();

                    
                    foreach($category_array as $cat):
                        echo '<option value="'.$cat['category_id'].'">'.$cat['category_name'].'</option>';
                    endforeach;
                    ?>
                </select>
        </div>
    </div>

    <div class="form-group row">
        <div class="col-sm-6 col-md-6">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Choose Date:</div>
                </div>
                <input type="text" name="to" id="to" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
            </div><hr>
            
        </div>

        <div class="col-sm-6 col-md-6">
            <input type="text" id="to_view" class="form-control datepicker" readonly value="<?=date('l F d, Y'); ?>">
        </div>
    </div>

    <div class="d-flex flex-row">
        <div style="margin-right: 10px">
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
            //$('#from').val(data.from);
            $('#to').val(data.to);

            //view update
           // $('#from_view').html(data.from_view);
            $('#to_view').val(data.to_view);
        });
    });

    /*$('#from').change(function(event) {
    
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });*/

    /*$('#from').keyup(function(event) {

        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });*/

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

    $('#inventory').submit(function(event) {
        /* Act on the event */
       // window.location.reload();
       $('.close').click();
    });
</script>