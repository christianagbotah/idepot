<!--CHOOSE PRINTER TO USE-->
<?php
echo form_open(site_url('admin/printer'),
  array('class' => 'form-groups-bordered', 'id' => 'select_printer', 'target' => '_top')); ?>
<div class="col-sm-12 col-md-12 printers_holder">
  <label class="control-label col-md-12 col-sm-12"><strong>SELECT PRINTER</strong></label>

  <hr>

  <div class="form-group row">
  <div class="col-sm-8 col-md-8">   
      <div class="form-check-inline">
        <label class="form-check-label">
          <input type="radio" class="form-check-input" checked value="1" id="thermal" name="printer" required><img src="<?php echo base_url('uploads/printers/thermal-printer.png') ?>" width="50" height="50" /> Thermal
        </label>
      </div>

      <div class="form-check-inline">
          <label class="form-check-label">
            <input type="radio" class="form-check-input" value="0" id="normal" name="printer" required><img src="<?php echo base_url('uploads/printers/normal-printer.png') ?>" width="50" height="50" /> Normal
          </label>
      </div>
    </div>

    <!-- Hidden infos here-->
    <input type="hidden" name="receipt_code" id="receipt_code" value="<?=$param3; ?>">
    <input type="hidden" name="customer_id" id="customer_id" value="<?=$param2; ?>">
    <input type="hidden" name="date_time" id="date_time" value="<?=$param4; ?>">

    <div class="col-md-4 col-sm-4">
        <input type="submit" name="submit" id="submit" class="form-check-inline btn btn-info btn-lg"
            value="Submit">
      </div>
  </div>
</div> 
</form>

<script type="text/javascript">
  $('#select_printer').submit(function(e) {
        e.preventDefault();

        let receipt_code = $('#receipt_code').val();
        //let invoice_code = $('#invoice_code').val();
        let customer_id = $('#customer_id').val();
        //let payment_id = $('#payment_id').val();
        let date_time = $('#date_time').val();
        //let so_code = $('#so_code').val();

        //loading receipt page
        $.ajax({
          url: '<?php echo site_url('admin/receipt/') ?>' + receipt_code +  '/' + customer_id + '/' + date_time,
          type: 'POST',
          data: new FormData(this),
          dataType: 'html',
          cache: false,
          contentType: false,
          processData: false

        })
        .done(function(response) {
          $('#printer_selection .close').click(); 
          showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
         // $('#receipt_holder').html(response);
        }).fail(function(err) {
          alert('Error generating receipts. Please refresh your current page and try again.');
        });
    });
        
</script>