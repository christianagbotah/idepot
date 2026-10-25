<?php
 //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

    $this->db->select('account_id');
    $this->db->where('account_is_transferrable', 1);
    $accounts_ids = $this->db->get('accounts')->result_array();
    
    $ids_array = array();

    foreach($accounts_ids as $id) {
      array_push($ids_array, $id['account_id']);
    }

    $dr_subtotal = 0;
    $cr_subtotal = 0;

    $dr_total = 0;
    $cr_total = 0;
    $current_total = 0;
    $_counter = 0;
    $journal_id_array = array();
?>


<table class="table" id="tab" width="100%">
            <thead class="bg-info">
                <th>Date</th>
                  <th>Account Name</th>
                  <th>Description</th>
                  <th style="text-align: right">DR Transactions</th>
                  <th style="text-align: right">CR Transactions</th>
                  <th style="text-align: right">Current Balance</th>
                </tr>
            </thead>
            <tbody>
              <?php 


        for($i = 0; $i < count($ids_array); $i++):

            if($account_id != 0) {
                  $this->db->where('account_id', $account_id);
              } else {
                $this->db->where('account_id', $ids_array[$i]);
              }

            $account_name = $this->db->get('accounts')->row()->name;

            //from general journal
            if($from != 0 && $to != 0) {
                  $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
              }
            $this->db->order_by('journal_id', 'asc');
            $accounts_query = $this->db->get_where('general_journal', array('account_name' => $account_name));
            $accounts_array = $accounts_query->result_array();

            if($accounts_query->num_rows() < 1) {
              $_counter++;
            }

            foreach($accounts_array as $account):
              array_push($journal_id_array, $account['journal_id']);
                ?>
                <tr ondblclick="deselect_all()" onclick="populate_links('<?=$account['journal_id']; ?>')" id="journal_id_<?=$account['journal_id'];?>">
                    <td><?=$account['date']; ?></td>
                    <td><?=strtoupper($account_name); ?></td>
                    <td><?=$account['description']; ?></td>
                    <td align="right"><strong><?=number_format($account['debit_amount'], 2, '.', ','); ?></strong></td>
                    <td align="right"><strong><?=number_format($account['credit_amount'], 2, '.', ','); ?></strong></td>
                    <td align="right"><strong><?=number_format($account['account_balance'], 2, '.', ','); ?></strong></td>
                </tr>
                <?php
                $dr_subtotal += $account['debit_amount'];
                $cr_subtotal += $account['credit_amount'];
            endforeach;

            $dr_total += $dr_subtotal;
            $cr_total += $cr_subtotal;
            //$current_total += $this->db->get_where('accounts', array('account_id' => $ids_array[$i]))->row()->current_balance;

            $dr_subtotal = 0;
            $cr_subtotal = 0;

            //exit loop if only one account is selected

            if($account_id != 0) {
              break;
            }
        endfor;

        if($account_id != 0) {//if we are searching using one accoun id, then let's see if _counter is greater than 1
          if($_counter > 0) {

            ?>
                <tr>
                  <td align="center" colspan="6"><strong>No Record Found</strong></td>
                </tr>
                <?php
          }

        } else { // searching with all the account ids...
          if($_counter == count($ids_array)) {

            ?>
                <tr>
                  <td align="center" colspan="6"><strong>No Record Found</strong></td>
                </tr>
                <?php
          }
        }
        
              ?>

            </tbody>
            <tfooter>
              <tr id="total_row" class="bg-dark text-light">
                    <td colspan="3" align="left"><strong>Total</strong></td>
                    <td align="right"><strong style="text-decoration: underline double"><?=numfmt_format_currency($fmt, $dr_total, $currency); ?></strong></td>
                    <td align="right"><strong style="text-decoration: underline double"><?=numfmt_format_currency($fmt, $cr_total, $currency); ?></strong></td>
                    <td align="right"><strong style="text-decoration: underline double"></strong></td>
              </tr>
            </tfooter>
        </table>

        <script type="text/javascript">
          $(function() {

              jQuery('#tab').DataTable();
          });

          document.jQuery(document).ready(function($) {
            
          });
          
           function populate_links(id) {
          //call the buttons enabled function immediately
          buttons_enabled();
          //get all order codes
          let journal_id_array = <?php echo json_encode($journal_id_array); ?>;

          for(i = 0; i < journal_id_array.length; i++) {

              //check which table row is clicked
              if(id == journal_id_array[i]) {

                  //change the background of the row
                  $('#journal_id_' + id).removeAttr('class');
                  $('#journal_id_' + id).css({
                      background: '#1cc88a',
                      color: '#ffffff'
                  });

              } else {
                  for(j = 0; j < journal_id_array.length; j++) {
                      if(journal_id_array[j] != id) {
                          $('#journal_id_' + journal_id_array[j]).removeAttr('style');

                      }
                  }
              }
          }
      }

      function deselect_all() {
          //call the buttons disabled function immediately
          buttons_disabled();
          let journal_id_array = <?php echo json_encode($journal_id_array); ?>;

          for(i = 0; i < journal_id_array.length; i++) {
              $('#journal_id_' + journal_id_array[i]).removeAttr('style');
          }
      }


        </script>