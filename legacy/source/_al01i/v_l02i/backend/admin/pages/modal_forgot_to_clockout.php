<center>
    <div class="jumbotron jumbotron-fluid">
      <div class="container">
        <h1 style="font-size: 30px; font-weight: bolder;">WELCOME BACK <?php echo $name; ?></h1>
        <br>
        <h3 class="text-white bg-danger p-5">'You forgot to CLOCK-OUT during the previous session. Please enter the time you left the office after your last CLOCK-IN.</h3>

        <!--FOR DISPLAYING TIME INPUT IF USER DID NOT LOGOUT DURING THE PREVIOUS SESSION -->
        <div>
          <?php
            echo form_open(site_url('admin/clock_in_out/update_clock_out/'),
  array('class' => 'form-groups-bordered', 'id' => 'update_clock_out', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-md-12 col-sm-12 col-xs-12">
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                  <input type="time" required="true" class="form-control col-md-4 col-sm-4 col-xs-4" name="closing_time" id="closing_time" value="17:30" style="text-align: center; font-size: 30px; font-weight: bolder"><br>

                  <button type="submit" class="col-md-4 col-sm-4 col-xs-4 btn btn-success btn-lg" style="text-align: center; font-size: 25px; font-weight: bolder"><i class="fas fa-clock-o fa-spin text-white"></i> Submit</button>
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                </div>
              </div>
            </form>
        </div> <!--END OF THAT -->

        <hr>
        <hr>
        <br>
        <h4 class="text-success">Do have a great day.</h4>
          <hr>
          <h5 class="text-warning"><small><em>Software Developed & Designed By Lightworld Technologies Ltd - 0243618186|0247612799</em></small></h4>
      </div>
    </div>
  </center>

  <script type="text/javascript">
    //delay clock out form submitted
  $('#update_clock_out').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    $('#create').slideUp('slow');
    
    const user_id = <?php echo $this->session->userdata('admin_id'); ?>;

    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/update_clock_out/') ?>' + user_id,
      type: 'POST',
      data: new FormData(this),
      dataType: 'text',
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(response) {
      if(response == 'done') {

        showAjaxModal_confirm('Very well. Your previous day\'s CLOCK-OUT has been successful. Kindly CLOCK-IN now to proceed', 'Success');

          setTimeout(() => {
            //$('#modal_confirm .close').click(); 
            window.location.reload();
          }, 2000);

      } else {
        showAjaxModal_confirm('Sorry, there seems to be a problem somewhere. Please try again.', 'Error');
      }
    });
  });
  </script>