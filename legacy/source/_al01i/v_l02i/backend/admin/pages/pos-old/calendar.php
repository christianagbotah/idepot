<!-- CALENDAR-->
<div class="col-md-12 col-xs-12">
    <div class="panel panel-info text-primary" data-collapsed="0" >
        <div class="panel-heading">
            <div class="panel-title">
                <i class="fa fa-calendar"></i>
                <?php echo get_phrase('event_schedule');?>
            </div>
        </div>
        <div class="panel-body" style="padding:0px;">
            <div class="calendar-env">
                <div class="calendar-body">
                    <div id="notice_calendar" style="font-size: 10px"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>


  $(function() {

    var calendar = $('#notice_calendar');

        $('#notice_calendar').fullCalendar({
          header: {
            left: 'title',
            right: 'today prev,next'
          },

          //defaultView: 'basicWeek',

          editable: false,
          firstDay: 1,
          height: 300,
          droppable: false,

          events: [
            <?php
            $notices  = $this->db->get('noticeboard')->result_array();
            foreach($notices as $row):
            ?>
            {
              title: "<?php echo $row['notice_title'];?>",
              start: new Date(<?php echo date('Y',$row['create_timestamp']);?>, <?php echo date('m',$row['create_timestamp'])-1;?>, <?php echo date('d',$row['create_timestamp']);?>),
              end:  new Date(<?php echo date('Y',$row['create_timestamp']);?>, <?php echo date('m',$row['create_timestamp'])-1;?>, <?php echo date('d',$row['create_timestamp']);?>)
            },
            <?php
            endforeach
            ?>

            //birthday-admins
            <?php
            $students_bd  = $this->db->get('admin')->result_array();
            foreach($students_bd as $row_s):
            ?>
            {
              title: ("<?php echo explode(' ', $row_s['name'])[0].'\'s birthday';?>").toLocaleUpperCase(),
              start: new Date(<?php echo date('Y', time());?>, <?php echo date('m',strtotime($row_s['birthday']))-1;?>, <?php echo date('d',strtotime($row_s['birthday']));?>),
              end:  new Date(<?php echo date('Y', time());?>, <?php echo date('m',strtotime($row_s['birthday']))-1;?>, <?php echo date('d',strtotime($row_s['birthday']));?>)
            },
            <?php
            endforeach
            ?>

          ]
        });
  });
  
  </script>