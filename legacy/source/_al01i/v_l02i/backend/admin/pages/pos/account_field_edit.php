<?php

    $accountDetailsQuery = $this->crud_model->getAccountDetailsByIds($idArray);

    if($accountDetailsQuery->num_rows() > 0) {
        //we have data
        $accountDetailsArray = $accountDetailsQuery->result_array();

        foreach($accountDetailsArray as $acc) {
            $idExists = false;
            for($i=0; $i < count($oldIdArray); $i++) {
                if($oldIdArray[$i] == $acc['account_id']) {
                    $idExists = true;
                }
            }

            //get the amount paid to each method
            $this->db->where('timestamp', $dateTimestamp);
            $this->db->where('so_code', $so_code);
            $this->db->where('account_id', $acc['account_id']);
            $amountPaid = $this->db->get('payment')->row()->amount;

            ?>
            <div class="flex gap-4">
                <span class="inline-flex items-center px-3 text-md max-w-2xl text-gray-900 bg-gray-200 border rounded-e-0 border-gray-300 border-e-0 rounded-s-md dark:bg-gray-600 dark:text-gray-400 dark:border-gray-600">
                <label><?=$acc['name'];?></label>
                </span>
                <input type="text" id="method_amount_<?=$acc['account_id'];?>" onkeyup="update_amount_paid($(this).val())"  name="method_amount_<?=$acc['account_id'];?>" required class="rounded-none rounded-e-lg bg-gray-50 border text-gray-900 focus:ring-blue-500 focus:border-blue-500 block flex-1 min-w-0 w-40 text-2xl border-gray-300 p-2.5  dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="amount" value="<?=$amountPaid;?>">
            </div>

    <?php
        }
    } else {
        //no data
        ?>
        <div class="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert">
            <svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
            </svg>
            <span class="sr-only">Info</span>
            <div class="font-bold text-xl">
                <span>Error: </span> No account found!
            </div>
        </div>
        <?php
    }
?>


