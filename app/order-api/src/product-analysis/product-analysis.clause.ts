// Buoc 8.11: SQL tho chay tren DB cua chinh ket noi (DATABASE_NAME) - KHONG ghi ten DB
// truoc ten bang (BE-12: ten monolith `order_db.` lam dashboard tra 500 o moi DB ten khac).
export const getAllProductAnalysisClause = `
    SELECT
        b.id_column AS branchId,
        DATE(o.created_at_column) AS orderDate,
        v.product_column AS productId,
        SUM(oi.quantity_column) AS totalProducts
    FROM 
        variant_tbl AS v
    INNER JOIN order_item_tbl AS oi
        ON v.id_column = oi.variant_column
    INNER JOIN order_tbl AS o
        ON oi.order_column = o.id_column
    INNER JOIN branch_tbl AS b
        ON o.branch_column = b.id_column
    INNER JOIN payment_tbl AS p
        ON o.payment_column = p.id_column
    WHERE
        p.status_code_column = 'completed'
    AND
        o.deleted_at_column IS NULL
    AND
        oi.deleted_at_column IS NULL
    GROUP BY
        b.id_column,
        DATE(o.created_at_column),
        v.product_column
    ORDER BY
        Date(o.created_at_column) ASC
`;

export const getYesterdayProductAnalysisClause = `
    SELECT
        b.id_column AS branchId,
        DATE(o.created_at_column) AS orderDate,
        v.product_column AS productId,
        SUM(oi.quantity_column) AS totalProducts
    FROM 
        variant_tbl AS v
    INNER JOIN order_item_tbl AS oi
        ON v.id_column = oi.variant_column
    INNER JOIN order_tbl AS o
        ON oi.order_column = o.id_column
    INNER JOIN branch_tbl AS b
        ON o.branch_column = b.id_column
    INNER JOIN payment_tbl AS p
        ON o.payment_column = p.id_column
    WHERE
        o.created_at_column >= CURRENT_DATE() - INTERVAL 1 DAY
    AND
        o.created_at_column < CURRENT_DATE()
    AND 
        p.status_code_column = 'completed'
    AND
        o.deleted_at_column IS NULL
    AND
        oi.deleted_at_column IS NULL
    GROUP BY
        b.id_column,
        DATE(o.created_at_column),
        v.product_column
`;

// COUNT(v.product_column) AS totalProducts

export const getSpecificProductAnalysisClause = `
    SELECT
        b.id_column AS branchId,
        DATE(o.created_at_column) AS orderDate,
        v.product_column AS productId,
        SUM(oi.quantity_column) AS totalProducts
    FROM 
        variant_tbl AS v
    INNER JOIN order_item_tbl AS oi
        ON v.id_column = oi.variant_column
    INNER JOIN order_tbl AS o
        ON oi.order_column = o.id_column
    INNER JOIN branch_tbl AS b
        ON o.branch_column = b.id_column
    INNER JOIN payment_tbl AS p
        ON o.payment_column = p.id_column
    WHERE
        o.created_at_column >= ?
    AND
        o.created_at_column < ?
    AND 
        p.status_code_column = 'completed'
    AND
        o.deleted_at_column IS NULL
    AND
        oi.deleted_at_column IS NULL
    GROUP BY
        b.id_column,
        DATE(o.created_at_column),
        v.product_column
`;

export const getSpecificProductAnalysisByHourAndBranchClause = `
    SELECT
        v.product_column AS productId,
        SUM(oi.quantity_column) AS totalProducts
    FROM 
        variant_tbl AS v
    INNER JOIN order_item_tbl AS oi
        ON v.id_column = oi.variant_column
    INNER JOIN order_tbl AS o
        ON oi.order_column = o.id_column
    INNER JOIN branch_tbl AS b
        ON o.branch_column = b.id_column
    INNER JOIN payment_tbl AS p
        ON o.payment_column = p.id_column
    WHERE
        o.created_at_column >= ?
    AND
        o.created_at_column < ?
    AND
        b.id_column = ?
    AND 
        p.status_code_column = 'completed'
    AND
        o.deleted_at_column IS NULL
    AND
        oi.deleted_at_column IS NULL
    GROUP BY
        v.product_column
    ORDER BY
        totalProducts DESC
`;
